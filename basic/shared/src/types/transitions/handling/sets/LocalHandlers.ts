import type { IgnoredReturn } from '@/types/common/IgnoredReturn'
import type { Transition } from '../../Transition'
import type { TransitionImpact } from '../../TransitionImpact'
import type { DbHandlerParams } from '../functions/DbHandlerParams'
import type { GeneralHandlingFunction } from '../GeneralHandlingFunction'
import type { RequiredActionsForImpact } from '../RequiredActionsForImpact'

export type LocalHandlers<T extends Transition> = {
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
						editMemoryModel: GeneralHandlingFunction<T>
				  }
				| {
						editMemoryModel: GeneralHandlingFunction<T>
						editDb: (params: DbHandlerParams<T>) => IgnoredReturn
				  }
		: T extends TransitionImpact.OptimisticPush
			?
					| {
							editMemoryModel: GeneralHandlingFunction<T>
							revertMemoryModel: GeneralHandlingFunction<T>
					  }
					| {
							editDb: (params: DbHandlerParams<T>) => IgnoredReturn
							revertDb: (params: DbHandlerParams<T>) => IgnoredReturn
					  }
					| {
							editMemoryModel: GeneralHandlingFunction<T>
							revertMemoryModel: GeneralHandlingFunction<T>
							editDb: (params: DbHandlerParams<T>) => IgnoredReturn
							revertDb: (params: DbHandlerParams<T>) => IgnoredReturn
					  }
			: never
}
