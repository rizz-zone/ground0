import type { Transition } from '@/types/transitions/Transition'
// import type { TransitionImpact } from '../../TransitionImpact'
import type { RequiredTransitionActionsForImpact } from '../RequiredTransitionActionsForImpact'

export type SharedTransitionHandlers<AppTransition extends Transition> = {
	[K in RequiredTransitionActionsForImpact<AppTransition, never>]: never
}
