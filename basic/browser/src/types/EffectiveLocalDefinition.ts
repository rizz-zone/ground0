import type {
	Transition,
	SyncEngineDefinition,
	LocalHandlers
} from '@ground0/shared'

export type EffectiveLocalDefinition<
	MemoryModel extends object,
	TransitionSchema extends Transition
> = {
	engineDef: SyncEngineDefinition<TransitionSchema>
	localHandlers: LocalHandlers<MemoryModel, TransitionSchema>
	initialMemoryModel: MemoryModel
}
