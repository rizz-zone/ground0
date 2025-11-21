import type {
	Transition,
	SyncEngineDefinition,
	LocalTransitionHandlers,
	Update,
	UpdateHandlers
} from '@ground0/shared'

export type LocalEngineDefinition<
	MemoryModel extends object,
	AppTransition extends Transition,
	AppUpdate extends Update
> = {
	engineDef: SyncEngineDefinition<AppTransition, AppUpdate>
	localTransitionHandlers: LocalTransitionHandlers<MemoryModel, AppTransition>
	updateHandlers: UpdateHandlers<MemoryModel, AppTransition, AppUpdate>
	initialMemoryModel: MemoryModel
	wsUrl: string
	dbName: string
	autoTransitions?: {
		onInit?: AppTransition | AppTransition[]
		onDbConnect?: AppTransition | AppTransition[]
		onWsConnect?: {
			once?: AppTransition | AppTransition[]
			everyTime?: AppTransition | AppTransition[]
		}
	}
}
