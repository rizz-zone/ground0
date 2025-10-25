import type { IgnoredReturn } from '@/types/common/IgnoredReturn'
import type { Transition } from '@/types/transitions/Transition'
import type { TransitionImpact } from '@/types/transitions/TransitionImpact'
import type { DbHandlerParams } from '@/types/transitions/handling/functions/DbHandlerParams'
import type { RequiredActionsForImpact } from '@/types/transitions/handling/RequiredActionsForImpact'
import type { MemoryHandlerParams } from '@/types/transitions/handling/functions/MemoryHandlerParams'

export type LocalHandlers<MemoryModel extends object, T extends Transition> = {
	[K in RequiredActionsForImpact<
		T,
		TransitionImpact.LocalOnly | TransitionImpact.OptimisticPush
	>]: T extends {
		impact: TransitionImpact.LocalOnly
	}
		?
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
		: T extends { impact: TransitionImpact.OptimisticPush }
			?
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
			: never
}
