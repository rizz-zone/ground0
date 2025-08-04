import type { Transition } from '../../Transition'
import type { TransitionImpact } from '../../TransitionImpact'
import type { GeneralHandlingFunction } from '../GeneralHandlingFunction'
import type { RequiredActionsForImpact } from '../RequiredActionsForImpact'

export type LocalHandlers<T extends Transition> = {
	[K in RequiredActionsForImpact<
		T,
		TransitionImpact.LocalOnly | TransitionImpact.OptimisticPush
	>]: T extends {
		impact: TransitionImpact.LocalOnly
	}
		? {
				editMemoryModel: GeneralHandlingFunction<T>
				editDb: GeneralHandlingFunction<T>
			}
		: T extends TransitionImpact.OptimisticPush
			?
					| {
							editMemoryModel: GeneralHandlingFunction<T>
							revertMemoryModel: GeneralHandlingFunction<T>
					  }
					| {
							editDb: GeneralHandlingFunction<T>
							revertDb: GeneralHandlingFunction<T>
					  }
					| {
							editMemoryModel: GeneralHandlingFunction<T>
							revertMemoryModel: GeneralHandlingFunction<T>
							editDb: GeneralHandlingFunction<T>
							revertDb: GeneralHandlingFunction<T>
					  }
			: never
}
