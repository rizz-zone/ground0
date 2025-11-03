import type { IgnoredReturn } from '@/types/common/IgnoredReturn'
import type { Transition } from '@/types/transitions/Transition'
import type { TransitionImpact } from '@/types/transitions/TransitionImpact'
import type { DbHandlerParams } from '@/types/transitions/handling/functions/DbHandlerParams'
import type { MemoryHandlerParams } from '@/types/transitions/handling/functions/MemoryHandlerParams'

type LocalOnlyHandlers<MemoryModel extends object, T extends Transition> =
	| {
			editDb: (params: DbHandlerParams<T>) => IgnoredReturn
	  }
	| {
			editMemoryModel: (
				params: MemoryHandlerParams<MemoryModel, T>
			) => IgnoredReturn
	  }
	| {
			editMemoryModel: (
				params: MemoryHandlerParams<MemoryModel, T>
			) => IgnoredReturn
			editDb: (params: DbHandlerParams<T>) => IgnoredReturn
	  }

type OptimisticPushHandlers<
	MemoryModel extends object,
	T extends Transition
> =
	| {
			editMemoryModel: (
				params: MemoryHandlerParams<MemoryModel, T>
			) => IgnoredReturn
			revertMemoryModel: (
				params: MemoryHandlerParams<MemoryModel, T>
			) => IgnoredReturn
	  }
	| {
			editDb: (params: DbHandlerParams<T>) => IgnoredReturn
			revertDb: (params: DbHandlerParams<T>) => IgnoredReturn
	  }
	| {
			editMemoryModel: (
				params: MemoryHandlerParams<MemoryModel, T>
			) => IgnoredReturn
			revertMemoryModel: (
				params: MemoryHandlerParams<MemoryModel, T>
			) => IgnoredReturn
			editDb: (params: DbHandlerParams<T>) => IgnoredReturn
			revertDb: (params: DbHandlerParams<T>) => IgnoredReturn
	  }

type HandlersForTransition<
	MemoryModel extends object,
	T extends Transition
> = T extends { impact: TransitionImpact.LocalOnly }
	? LocalOnlyHandlers<MemoryModel, T>
	: T extends { impact: TransitionImpact.OptimisticPush }
	? OptimisticPushHandlers<MemoryModel, T>
	: never

export type LocalHandlers<
	MemoryModel extends object,
	T extends Transition
> = {
	[K in T['action']]?: HandlersForTransition<
		MemoryModel,
		Extract<T, { action: K }>
	>
}