import { TransitionImpact } from './TransitionImpact'
import {
	union,
	object,
	string,
	optional,
	enum as zEnum,
	type z,
	looseObject,
	int
} from 'zod/mini'

// Slightly unusual naming for this repo, but required because of
// TransitionSchema.ts which is more relevant to consumers (this is, in
// comparison, really only important for internal Durable Object code)
export const TransitionZodSchema = object({
	action: union([string(), int()]),
	impact: zEnum(TransitionImpact),
	data: optional(looseObject({}))
})
export type Transition = z.infer<typeof TransitionZodSchema>
export const isTransition = (obj: unknown): obj is Transition =>
	TransitionZodSchema.safeParse(obj).success
