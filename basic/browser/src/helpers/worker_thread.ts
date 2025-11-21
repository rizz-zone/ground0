/// <reference lib="webworker" />

import {
	DownstreamWsMessageAction,
	TransitionImpact,
	type DownstreamWsMessage,
	type LocalTransitionHandlers,
	type Transition,
	type Update,
	type UpdateHandlers
} from '@ground0/shared'
import type { Transformation } from '@/types/memory_model/Tranformation'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { createMemoryModel } from './memory_model'
import SuperJSON from 'superjson'
import type { TransitionRunner } from '@/runners/base'
import { runners } from '@/runners/all'
import type { OptimisticPushTransitionRunner } from '@/runners/specialised/optimistic_push'
import { DbThinClient } from '@/resource_managers/db'
import { connectWs } from '@/resource_managers/ws'
import { brandedLog } from '@/common/branded_log'
import type { LocalEngineDefinition } from '@/types/LocalEngineDefinition'

export class WorkerLocalFirst<
	MemoryModel extends object,
	AppTransition extends Transition,
	AppUpdate extends Update
> {
	private readonly resourceBundle: ResourceBundle
	private readonly localTransitionHandlers: LocalTransitionHandlers<
		MemoryModel,
		AppTransition
	>
	private readonly updateHandlers: UpdateHandlers<
		MemoryModel,
		AppTransition,
		AppUpdate
	>
	public readonly memoryModel: MemoryModel
	private readonly dbThinClient?: DbThinClient
	private readonly autoTransitions?: Omit<
		NonNullable<
			LocalEngineDefinition<
				MemoryModel,
				AppTransition,
				AppUpdate
			>['autoTransitions']
		>,
		'onInit'
	>

	public constructor({
		wsUrl,
		dbName,
		engineDef,
		localTransitionHandlers,
		updateHandlers,
		initialMemoryModel,
		autoTransitions,
		announceTransformation
	}: LocalEngineDefinition<MemoryModel, AppTransition, AppUpdate> & {
		announceTransformation: (transformation: Transformation) => unknown
	}) {
		const shared = 'onconnect' in self
		this.resourceBundle = {
			ws: { status: WsResourceStatus.Disconnected },
			db: {
				status: shared
					? DbResourceStatus.Disconnected
					: DbResourceStatus.NeverConnecting
			}
		}

		this.localTransitionHandlers = localTransitionHandlers
		this.updateHandlers = updateHandlers
		this.memoryModel = createMemoryModel(
			initialMemoryModel,
			announceTransformation
		)

		if (shared)
			this.dbThinClient = new DbThinClient({
				syncResources: this.syncResources.bind(this),
				dbName,
				migrations: engineDef.db.migrations
			})
		connectWs({
			wsUrl,
			currentVersion: engineDef.version.current,
			syncResources: this.syncResources.bind(this),
			handleMessage: this.handleMessage.bind(this)
		})

		if (autoTransitions) {
			const { onInit, onDbConnect, onWsConnect } = autoTransitions
			if (onDbConnect || onWsConnect) {
				this.autoTransitions = {
					onDbConnect,
					onWsConnect
				}
			}
			if (onInit) {
				queueMicrotask(() => {
					for (const transitionObj of Array.isArray(onInit) ? onInit : [onInit])
						this.transition(transitionObj)
				})
			}
		}
	}

	private wsConnectedBefore = false
	private syncResources(modifications: Partial<ResourceBundle>) {
		let somethingChanged = false
		if (modifications.db) {
			this.resourceBundle.db = modifications.db
			somethingChanged = true

			if (modifications.db.status === DbResourceStatus.ConnectedAndMigrated)
				queueMicrotask(() => {
					if (this.autoTransitions && this.autoTransitions.onDbConnect) {
						const { onDbConnect } = this.autoTransitions
						for (const transitionObj of Array.isArray(onDbConnect)
							? onDbConnect
							: [onDbConnect])
							this.transition(transitionObj)
					}
				})
		}
		if (modifications.ws) {
			this.resourceBundle.ws = modifications.ws
			somethingChanged = true

			if (modifications.ws.status === WsResourceStatus.Connected) {
				const currentWsConnectedBefore = this.wsConnectedBefore
				this.wsConnectedBefore = true
				queueMicrotask(() => {
					if (this.autoTransitions && this.autoTransitions.onWsConnect) {
						const { onWsConnect } = this.autoTransitions
						for (const propertyAndAddedCondition of [
							{ property: 'once', addedCondition: currentWsConnectedBefore },
							{ property: 'everyTime', addedCondition: true }
						] satisfies {
							property: keyof typeof onWsConnect
							addedCondition: boolean
						}[]) {
							const transitions =
								onWsConnect[propertyAndAddedCondition['property']]
							if (propertyAndAddedCondition.addedCondition && transitions)
								for (const transitionObj of Array.isArray(transitions)
									? transitions
									: [transitions])
									this.transition(transitionObj)
						}
					}
				})
			}
		}
		if (somethingChanged)
			for (const runner of this.transitionRunners.values())
				runner.syncResources(this.resourceBundle)
	}

	private async handleMessage(
		message: MessageEvent<string | Blob | ArrayBuffer>
	) {
		// The ws resource manager handles pings. We only need to respond to
		// messages that need an action.

		let decoded: DownstreamWsMessage | undefined

		// Assign decoded, use wildcard if we didn't get a SuperJSON objet with
		// an action on it
		if (
			typeof message.data !== 'string' ||
			(() => {
				try {
					decoded = SuperJSON.parse(message.data)
				} catch {
					return true
				}
				if (!decoded || !('action' in decoded)) return true
				return false
			})() ||
			!decoded
		) {
			// TODO: Use a 'wildcard' handler here

			brandedLog(
				console.warn,
				'The server sent a ws message that could not be decoded:',
				message.data
			)
			return
		}

		switch (decoded.action) {
			case DownstreamWsMessageAction.OptimisticCancel:
			case DownstreamWsMessageAction.OptimisticResolve: {
				const runner = this.transitionRunners.get(decoded.id) as
					| OptimisticPushTransitionRunner<MemoryModel>
					| undefined

				// It's unlikely but we might not have the runner anymore
				if (!runner) return

				// reportWsResult takes a boolean for whether the ws
				// confirmed or not
				return runner.reportWsResult(
					decoded.action === DownstreamWsMessageAction.OptimisticResolve
				)
			}
			case DownstreamWsMessageAction.Update:
				// @ts-expect-error TS can't narrow the type down as narrowly
				// as it wants to, and there's no convenient way to make it
				this.updateHandlers[decoded.data.action]({
					data: decoded.data.data,
					memoryModel: this.memoryModel,
					transition: this.transition.bind(this)
				})
				return
			default:
				decoded satisfies never
				brandedLog(
					console.warn,
					'The server sent a ws message that was decoded, but could not be matched to an action:',
					decoded
				)
				return
		}
	}

	private readonly transitionRunners = new Map<
		number,
		{
			[K in keyof typeof TransitionImpact]: TransitionRunner<
				MemoryModel,
				(typeof TransitionImpact)[K]
			>
		}[keyof typeof TransitionImpact]
	>()
	private nextTransitionId = 0
	public transition(transition: AppTransition) {
		if (
			!Object.values(TransitionImpact)
				.filter((k) => typeof k === 'number')
				.includes(transition.impact)
		) {
			brandedLog(
				console.warn,
				'Invalid transition impact used:',
				transition.impact
			)
			return
		}
		const id = this.nextTransitionId
		this.transitionRunners.set(
			id,
			new runners[transition.impact]({
				resources: this.resourceBundle,
				memoryModel: this.memoryModel,
				id,
				transition,
				// @ts-expect-error TS can't narrow the type down as narrowly
				// as it wants to, and there's no convenient way to make it
				localHandler: this.localTransitionHandlers[transition.action],
				markComplete: () => {
					this.transitionRunners.delete(id)
				}
			})
		)
		this.nextTransitionId++
	}
	public newPort(...params: Parameters<DbThinClient['newPort']>) {
		this.dbThinClient?.newPort(...params)
	}
}
