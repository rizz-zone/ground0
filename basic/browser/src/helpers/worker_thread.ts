/// <reference lib="webworker" />

import {
	DownstreamWsMessageAction,
	UpstreamWsMessageAction,
	WsCloseCode,
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

	private missedPings = 0
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
						if (this.missedPings <= 3) return this.connectWs()
						this.ws.send('?')
						this.missedPings++
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
				if (this.ws === ws) this.missedPings--
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
					return
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

	public [Symbol.dispose] = () => {
		// TODO: Put something here if it feels particularly relevant. But it doesn't really
	}
}
