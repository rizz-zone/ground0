import type { Transition } from '@/types/transitions/Transition'
import type { TransitionImpact } from '@/types/transitions/TransitionImpact'
import type { HandlerParams } from '@/types/transitions/handling/HandlerParams'
import type { RequiredActionsForImpact } from '@/types/transitions/handling/RequiredActionsForImpact'

export type BackendHandlers<T extends Transition> = {
	[K in RequiredActionsForImpact<
		T,
		TransitionImpact.OptimisticPush
	>]: T extends { impact: TransitionImpact.OptimisticPush }
		? {
				confirm: (params: HandlerParams<T>) => boolean | Promise<boolean>
			}
		: never
}
