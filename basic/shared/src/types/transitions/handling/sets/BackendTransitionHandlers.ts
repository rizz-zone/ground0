import type { Transition } from '@/types/transitions/Transition'
import type { TransitionImpact } from '@/types/transitions/TransitionImpact'
import type { RequiredTransitionActionsForImpact } from '@/types/transitions/handling/RequiredTransitionActionsForImpact'
import type { BackendHandlerParams } from '../functions/backend/BackendHandlerParams'

export type OptimisticPushHandlers<AppTransition extends Transition> = {
	confirm: (
		params: BackendHandlerParams<AppTransition>
	) => boolean | Promise<boolean>
}
export type SomeWsOnlyNudgeHandlers<AppTransition extends Transition> = {
	handle: (params: BackendHandlerParams<AppTransition>) => unknown
}
type HandlersForTransition<AppTransition extends Transition> =
	AppTransition extends {
		impact: TransitionImpact.OptimisticPush
	}
		? OptimisticPushHandlers<AppTransition>
		: AppTransition extends {
					impact:
						| TransitionImpact.UnreliableWsOnlyNudge
						| TransitionImpact.WsOnlyNudge
			  }
			? SomeWsOnlyNudgeHandlers<AppTransition>
			: never

export type BackendTransitionHandlers<AppTransition extends Transition> = {
	[K in RequiredTransitionActionsForImpact<
		AppTransition,
		| TransitionImpact.OptimisticPush
		| TransitionImpact.UnreliableWsOnlyNudge
		| TransitionImpact.WsOnlyNudge
	>]: HandlersForTransition<Extract<AppTransition, { action: K }>>
}
