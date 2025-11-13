import type {
	Transition,
	SyncEngineDefinition,
	LocalTransitionHandlers
} from '@ground0/shared'

export type LocalEngineDefinition<
	MemoryModel extends object,
	T extends Transition
> = {
	engineDef: SyncEngineDefinition<T>
	localHandlers: LocalTransitionHandlers<MemoryModel, T>
	initialMemoryModel: MemoryModel
	wsUrl: string
	dbName: string
}
