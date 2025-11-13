import type { Transition } from '@/types/transitions/Transition'
import type { TransitionImpact } from '@/types/transitions/TransitionImpact'
import type { RequiredTransitionActionsForImpact } from '@/types/transitions/handling/RequiredActionsForImpact'
import type { BackendHandlerParams } from '../functions/backend/BackendHandlerParams'

type OptimisticPushHandlers<AppTransition extends Transition> = {
	confirm: (
		params: BackendHandlerParams<AppTransition>
	) => boolean | Promise<boolean>
}

type HandlersForTransition<AppTransition extends Transition> =
	AppTransition extends {
		impact: TransitionImpact.OptimisticPush
	}
		? OptimisticPushHandlers<AppTransition>
		: never

export type BackendHandlers<AppTransition extends Transition> = {
	[K in RequiredTransitionActionsForImpact<
		AppTransition,
		TransitionImpact.OptimisticPush
	>]: HandlersForTransition<
		Extract<
			AppTransition,
			{ action: K; impact: TransitionImpact.OptimisticPush }
		>
	>
}
