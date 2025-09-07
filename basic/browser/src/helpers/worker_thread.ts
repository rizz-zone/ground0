/// <reference lib="webworker" />

import {
	DownstreamWsMessageAction,
	UpstreamWsMessageAction,
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
		announceTransformation
	}: {
		wsUrl: string
		dbName: string
		engineDef: SyncEngineDefinition<TransitionSchema>
		localHandlers: LocalHandlers<MemoryModel, TransitionSchema>
		initialMemoryModel: MemoryModel
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

		this.wsUrl = wsUrl
		this.dbName = dbName
		this.engineDef = engineDef
		this.localHandlers = localHandlers
		this.memoryModel = createMemoryModel(
			initialMemoryModel,
			announceTransformation
		)

		if (shared) this.connectDb()
		this.connectWs()
	}
	public transition() {}

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

	// TODO: actual like db value and stuff
	private async connectDb() {}

	private ws?: WebSocket
	private async connectWs() {
		const ws = new WebSocket(this.wsUrl)
		this.ws = ws
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

			// TODO: Establish a ping interval
		}
		// TODO: Complete these
		ws.onmessage = (message) => {
			let decoded: DownstreamWsMessage
			try {
				decoded = SuperJSON.parse(message.data)
				if (!('action' in decoded)) throw new Error()
			} catch {
				// TODO: Handle this
				return
			}
			switch (decoded.action) {
				case DownstreamWsMessageAction.OptimisticCancel:
				case DownstreamWsMessageAction.OptimisticResolve: {
					return
				}
				default:
					return
			}
		}
		ws.onerror = () => {
			ws.close()
			if (this.ws === ws) this.connectWs()
		}
		ws.onclose = () => {
			if (this.ws !== ws) return
			this.connectWs()
		}
	}

	public [Symbol.dispose] = () => {
		// TODO: Put something here if it feels particularly relevant. But it doesn't really
	}
}
