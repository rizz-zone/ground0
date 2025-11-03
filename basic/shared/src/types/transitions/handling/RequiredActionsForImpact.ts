import type { Transition } from '@/types/transitions/Transition'

export type RequiredActionsForImpact<
	T extends Transition,
	RequiredImpact
> = Extract<T, { impact: RequiredImpact }>['action']
