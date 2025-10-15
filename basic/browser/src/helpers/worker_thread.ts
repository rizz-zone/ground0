/// <reference lib="webworker" />

import {
	DownstreamWsMessageAction,
	TransitionImpact,
	type DownstreamWsMessage,
	type LocalHandlers,
	type SyncEngineDefinition,
	type Transition
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
import { connectDb } from '@/resource_managers/db'
import { connectWs } from '@/resource_managers/ws'
import { brandedLog } from '@/common/branded_log'

export class WorkerLocalFirst<
	MemoryModel extends object,
	TransitionSchema extends Transition
> {
	private readonly resourceBundle: ResourceBundle
	private readonly engineDef: SyncEngineDefinition<TransitionSchema>
	private readonly localHandlers: LocalHandlers<MemoryModel, TransitionSchema>
	public readonly memoryModel: MemoryModel

	public constructor({
		wsUrl,
		dbName,
		engineDef,
		localHandlers,
		initialMemoryModel,
		announceTransformation,
		pullWasmBinary
	}: {
		wsUrl: string
		dbName: string
		engineDef: SyncEngineDefinition<TransitionSchema>
		localHandlers: LocalHandlers<MemoryModel, TransitionSchema>
		initialMemoryModel: MemoryModel
		announceTransformation: (transformation: Transformation) => unknown
		pullWasmBinary: () => Promise<ArrayBuffer>
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

		this.engineDef = engineDef
		this.localHandlers = localHandlers
		this.memoryModel = createMemoryModel(
			initialMemoryModel,
			announceTransformation
		)

		if (shared)
			connectDb({
				pullWasmBinary,
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
	}

	private syncResources(modifications: Partial<ResourceBundle>) {
		let somethingChanged = false
		if (modifications.db) {
			this.resourceBundle.db = modifications.db
			somethingChanged = true
		}
		if (modifications.ws) {
			this.resourceBundle.ws = modifications.ws
			somethingChanged = true
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
			default:
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
	public transition(
		transition: NonNullable<
			(typeof this.engineDef.transitions.schema)['types']
		>['input']
	) {
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
				// @ts-expect-error TS can't narrow the type down as narrowly as it wants to, and there's no convenient way to make it
				transition,
				// @ts-expect-error TS can't narrow the type down as narrowly as it wants to, and there's no convenient way to make it
				localHandler: this.localHandlers[transition.action],
				markComplete: () => {
					this.transitionRunners.delete(id)
				}
			})
		)
		this.nextTransitionId++
	}
}
