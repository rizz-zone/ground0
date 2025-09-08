/// <reference lib="webworker" />

import {
	DownstreamWsMessageAction,
	UpstreamWsMessageAction,
	WsCloseCode,
	type TransitionImpact,
	type DownstreamWsMessage,
	type LocalHandlers,
	type SyncEngineDefinition,
	type Transition,
	type UpstreamWsMessage
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
// @ts-expect-error wa-sqlite has no type definitions
import { OPFSCoopSyncVFS } from 'wa-sqlite/src/examples/OPFSCoopSyncVFS.js'
// @ts-expect-error wa-sqlite has no type definitions
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
// @ts-expect-error wa-sqlite has no type definitions
import * as SQLite from 'wa-sqlite/src/sqlite-api.js'

export class WorkerLocalFirst<
	MemoryModel extends object,
	TransitionSchema extends Transition
> {
	private readonly resourceBundle: ResourceBundle
	private readonly wsUrl: string
	private readonly dbName: string
	private readonly engineDef: SyncEngineDefinition<TransitionSchema>
	private readonly localHandlers: LocalHandlers<MemoryModel, TransitionSchema>
	private readonly memoryModel: MemoryModel

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
		pullWasmBinary: () => Promise<ArrayBuffer> // TODO: use a proper type that actually helps. also set this
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

		this.wsUrl = wsUrl
		this.dbName = dbName
		this.engineDef = engineDef
		this.localHandlers = localHandlers
		this.memoryModel = createMemoryModel(
			initialMemoryModel,
			announceTransformation
		)

		if (shared) this.connectDb(pullWasmBinary)
		this.connectWs()
	}

	private syncResources(modifications: Partial<ResourceBundle>) {
		if (modifications.db) {
			this.resourceBundle.db = modifications.db
			// TODO: Loop through anything that depends on the db
		}
		if (modifications.ws) {
			this.resourceBundle.ws = modifications.ws
			// TODO: Loop through anything that depends on the ws
		}
	}

	// TODO: Finish connectDb, which will be a bit painful because sqlite
	private async connectDb(pullWasmBinary: () => Promise<ArrayBuffer>) {
		// connectDb shouldn't be called if the db will never connect, but it's
		// worth checking anyway
		// TODO: Make this error message more Detailed
		if (this.resourceBundle.db.status !== DbResourceStatus.Disconnected)
			return console.warn(
				'there is a db, or the db is not connecting, why has connectDb been called'
			)

		// Get the wasm with the code of the adapter. It's the adapter's
		// responsibility to do this, including providing a retry method
		const module = await pullWasmBinary().then(
			(wasm) =>
				SQLiteESMFactory({
					instantiateWasm: (
						imports: WebAssembly.Imports,
						successCallback: (instance: WebAssembly.Instance) => void
					) => {
						WebAssembly.instantiate(wasm, imports).then(({ instance }) => {
							successCallback(instance)
						})
						return {} // emscripten requires this return
					}
				}),
			() => {
				this.syncResources({ db: { status: DbResourceStatus.NeverConnecting } })
			}
		)
		// The module will be undefined if onrejected was called
		if (typeof module === 'undefined') return

		const sqlite3 = SQLite.Factory(module)

		// Register a custom file system.
		// TODO: Figure out if we can / should just be calling it 'hello' or if
		// that's bad and should cnange
		const vfs = await OPFSCoopSyncVFS.create('hello', module)
		sqlite3.vfs_register(vfs, true)

		// Open the database.
		const db = await sqlite3.open_v2(this.dbName) // NOTE TO SELF: THIS IS A POINTER
	}

	private dissatisfiedPings = 0
	private ws?: WebSocket
	private async connectWs() {
		const ws = new WebSocket(this.wsUrl)
		this.ws = ws
		this.dissatisfiedPings = 0
		ws.onopen = () => {
			if (this.ws !== ws) {
				ws.close()
				return
			}
			ws.send(
				SuperJSON.stringify({
					action: UpstreamWsMessageAction.Init,
					version: this.engineDef.version.current
				} satisfies UpstreamWsMessage)
			)
			this.syncResources({
				ws: { status: WsResourceStatus.Connected, instance: ws }
			})

			// Ping interval
			{
				let interval: ReturnType<typeof setInterval> | undefined = setInterval(
					() => {
						if (this.ws !== ws) {
							if (interval) {
								clearInterval(interval)
								interval = undefined
							}
							return
						}
						if (this.dissatisfiedPings <= 3) return this.connectWs()
						this.ws.send('?')
						this.dissatisfiedPings++
					},
					5000 / 3
				)
			}
		}
		ws.onmessage = (message) => {
			// It's unlikely for us to get messages if this.ws !== ws, because
			// the connection should always close if that is the case, but it
			// *is* still possible to get relevant responses, potentially.

			// Handle pong messages first
			if (message.data === '!') {
				if (this.ws === ws) this.dissatisfiedPings--
				return
			}

			let decoded: DownstreamWsMessage
			try {
				decoded = SuperJSON.parse(message.data)
				if (!('action' in decoded)) throw new Error()
			} catch {
				// TODO: Use a user-defined 'wildcard' handler, log instead if
				// one isn't present
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
		ws.onerror = () => {
			ws.close(WsCloseCode.Error)
			if (this.ws === ws) this.connectWs()
		}
		ws.onclose = () => {
			if (this.ws !== ws) return
			this.connectWs()
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
		this.transitionRunners.set(
			this.nextTransitionId,
			// TODO: Because we can't just pass an actorRef in anymore
			// (because there is no actor), we need to update
			// TransitionRunner so there's a different way to give us a
			// nudge here when a transition is done.
			new runners[transition.impact]({
				resources: this.resourceBundle,
				memoryModel: this.memoryModel,
				id: this.nextTransitionId,
				// @ts-expect-error TS can't narrow the type down as narrowly as it wants to, and there's no convenient way to make it
				transition,
				// @ts-expect-error TS can't narrow the type down as narrowly as it wants to, and there's no convenient way to make it
				localHandler: this.localHandlers[transition.action]
			})
		)
		this.nextTransitionId++
	}

	public [Symbol.dispose] = () => {
		// TODO: Put something here if it feels particularly relevant. But it doesn't really
	}
}
