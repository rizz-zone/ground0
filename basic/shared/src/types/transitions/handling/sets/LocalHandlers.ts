import type { IgnoredReturn } from '@/types/common/IgnoredReturn'
import type { Transition } from '@/types/transitions/Transition'
import type { TransitionImpact } from '@/types/transitions/TransitionImpact'
import type { DbHandlerParams } from '@/types/transitions/handling/functions/frontend/DbHandlerParams'
import type { MemoryHandlerParams } from '@/types/transitions/handling/functions/frontend/MemoryHandlerParams'

type LocalOnlyHandlers<
	MemoryModel extends object,
	AppTransition extends Transition
> =
	| {
			editDb: (params: DbHandlerParams<AppTransition>) => IgnoredReturn
	  }
	| {
			editMemoryModel: (
				params: MemoryHandlerParams<MemoryModel, AppTransition>
			) => IgnoredReturn
	  }
	| {
			editMemoryModel: (
				params: MemoryHandlerParams<MemoryModel, AppTransition>
			) => IgnoredReturn
			editDb: (params: DbHandlerParams<AppTransition>) => IgnoredReturn
	  }

type OptimisticPushHandlers<
	MemoryModel extends object,
	AppTransition extends Transition
> =
	| {
			editMemoryModel: (
				params: MemoryHandlerParams<MemoryModel, AppTransition>
			) => IgnoredReturn
			revertMemoryModel: (
				params: MemoryHandlerParams<MemoryModel, AppTransition>
			) => IgnoredReturn
	  }
	| {
			editDb: (params: DbHandlerParams<AppTransition>) => IgnoredReturn
			revertDb: (params: DbHandlerParams<AppTransition>) => IgnoredReturn
	  }
	| {
			editMemoryModel: (
				params: MemoryHandlerParams<MemoryModel, AppTransition>
			) => IgnoredReturn
			revertMemoryModel: (
				params: MemoryHandlerParams<MemoryModel, AppTransition>
			) => IgnoredReturn
			editDb: (params: DbHandlerParams<AppTransition>) => IgnoredReturn
			revertDb: (params: DbHandlerParams<AppTransition>) => IgnoredReturn
	  }

type HandlersForTransition<
	MemoryModel extends object,
	AppTransition extends Transition
> = AppTransition extends { impact: TransitionImpact.LocalOnly }
	? LocalOnlyHandlers<MemoryModel, AppTransition>
	: AppTransition extends { impact: TransitionImpact.OptimisticPush }
		? OptimisticPushHandlers<MemoryModel, AppTransition>
		: never

export type LocalHandlers<
	MemoryModel extends object,
	AppTransition extends Transition
> = {
	[K in AppTransition['action']]?: HandlersForTransition<
		MemoryModel,
		Extract<AppTransition, { action: K }>
	>
}
