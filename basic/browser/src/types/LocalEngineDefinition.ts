import type {
	Transition,
	SyncEngineDefinition,
	LocalHandlers
} from '@ground0/shared'

export type LocalEngineDefinition<
	MemoryModel extends object,
	T extends Transition
> = {
	engineDef: SyncEngineDefinition<T>
	localHandlers: LocalHandlers<MemoryModel, T>
	initialMemoryModel: MemoryModel
	pullWasmBinary: () => Promise<ArrayBuffer>
	wsUrl: string
	dbName: string
	workerUrl: URL
}
