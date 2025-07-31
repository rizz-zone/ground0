import {
	discriminatedUnion,
	literal,
	object,
	refine,
	string,
	type z
} from 'zod/mini'
import { UpstreamWsMessageAction } from './UpstreamWsMessageAction'
import semverValid from 'semver/functions/valid'
import { TransitionSchema } from '../transitions/Transition'

export const UpstreamWsMessageSchema = discriminatedUnion('action', [
	object({
		action: literal(UpstreamWsMessageAction.Init),
		version: string().check(refine(semverValid))
	}),
	object({
		action: literal(UpstreamWsMessageAction.Transition),
		data: TransitionSchema
	})
])
export type UpstreamWsMessage = z.infer<typeof UpstreamWsMessageSchema>
export const isUpstreamWsMessage = (obj: unknown): obj is UpstreamWsMessage =>
	UpstreamWsMessageSchema.safeParse(obj).success
