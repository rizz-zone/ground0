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

export const TransitionSchema = object({
	action: union([string(), int()]),
	impact: zEnum(TransitionImpact),
	data: optional(looseObject({}))
})
export type Transition = z.infer<typeof TransitionSchema>
export const isTransition = (obj: unknown): obj is Transition =>
	TransitionSchema.safeParse(obj).success
