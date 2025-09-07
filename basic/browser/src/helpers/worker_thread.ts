/// <reference lib="webworker" />

import type {
	LocalHandlers,
	SyncEngineDefinition,
	Transition
} from '@ground0/shared'
import type { Transformation } from '@/types/memory_model/Tranformation'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { createMemoryModel } from './memory_model'

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

	private syncResources(modifications: Partial<ResourceBundle>) {
		if (modifications.db) {
			this.resourceBundle.db = modifications.db
		}
	}
	private async connectDb() {}
	private async connectWs() {}

	public [Symbol.dispose] = () => {
		// TODO: Put something here if it feels particularly relevant. But it doesn't really
	}
}
