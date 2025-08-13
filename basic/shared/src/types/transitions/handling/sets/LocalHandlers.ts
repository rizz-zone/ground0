import type { IgnoredReturn } from '@/types/common/IgnoredReturn'
import type { Transition } from '../../Transition'
import type { TransitionImpact } from '../../TransitionImpact'
import type { DbHandlerParams } from '../functions/DbHandlerParams'
import type { RequiredActionsForImpact } from '../RequiredActionsForImpact'
import type { MemoryHandlerParams } from '../functions/MemoryHandlerParams'

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
		: T extends TransitionImpact.OptimisticPush
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
