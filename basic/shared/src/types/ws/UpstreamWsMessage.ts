import {
	discriminatedUnion,
	extend,
	literal,
	object,
	refine,
	string,
	union,
	type z
} from 'zod/mini'
import { UpstreamWsMessageAction } from './UpstreamWsMessageAction'
import semverValid from 'semver/functions/valid'
import { TransitionZodSchema } from '../transitions/Transition'
import { TransitionImpact } from '../transitions/TransitionImpact'

export const UpstreamWsMessageSchema = discriminatedUnion('action', [
	object({
		action: literal(UpstreamWsMessageAction.Init),
		version: string().check(refine(semverValid))
	}),
	object({
		action: literal(UpstreamWsMessageAction.Transition),
		data: extend(TransitionZodSchema, {
			impact: union([literal(TransitionImpact.OptimisticPush)])
		})
	})
])
export type UpstreamWsMessage = z.infer<typeof UpstreamWsMessageSchema>
export const isUpstreamWsMessage = (obj: unknown): obj is UpstreamWsMessage =>
	UpstreamWsMessageSchema.safeParse(obj).success
