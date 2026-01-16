import type { Transition } from '@/types/transitions/Transition'

export type RequiredTransitionActionsForImpact<
	T extends Transition,
	RequiredImpact
> = Extract<T, { impact: RequiredImpact }>['action']
