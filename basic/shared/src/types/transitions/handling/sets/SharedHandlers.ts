import type { Transition } from '@/types/transitions/Transition'
// import type { TransitionImpact } from '../../TransitionImpact'
import type { RequiredActionsForImpact } from '../RequiredActionsForImpact'

export type SharedHandlers<T extends Transition> = {
	[K in RequiredActionsForImpact<T, never>]: never
}
