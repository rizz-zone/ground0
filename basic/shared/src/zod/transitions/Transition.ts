import type { Transition } from '@/types/transitions/Transition'
import { TransitionImpact } from '../../types/transitions/TransitionImpact'
import {
	union,
	object,
	string,
	optional,
	enum as zEnum,
	looseObject,
	int
} from 'zod/mini'

// Slightly unusual naming for this repo, but required because of
// TransitionSchema.ts which is more relevant to consumers (this is, in
// comparison, really only important for internal Durable Object code)
export const TransitionSchema = object({
	action: union([string(), int()]),
	impact: zEnum(TransitionImpact),
	data: optional(looseObject({}))
})
export const isTransition = (obj: unknown): obj is Transition =>
	TransitionSchema.safeParse(obj).success
