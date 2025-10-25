import type { Transition } from '@/types/transitions/Transition'

export type RequiredActionsForImpact<
	T extends Transition,
	RequiredImpact
> = T extends { impact: RequiredImpact } ? T['action'] : never
