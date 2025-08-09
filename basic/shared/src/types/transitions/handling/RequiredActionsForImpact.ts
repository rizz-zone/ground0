import type { Transition } from '../Transition'

export type RequiredActionsForImpact<
	T extends Transition,
	RequiredImpact
> = T extends { impact: RequiredImpact } ? T['action'] : never
