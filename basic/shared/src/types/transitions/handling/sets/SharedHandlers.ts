import type { Transition } from '@/types/transitions/Transition'
// import type { TransitionImpact } from '../../TransitionImpact'
import type { RequiredActionsForImpact } from '../RequiredActionsForImpact'

export type SharedHandlers<AppTransition extends Transition> = {
	[K in RequiredActionsForImpact<AppTransition, never>]: never
}
