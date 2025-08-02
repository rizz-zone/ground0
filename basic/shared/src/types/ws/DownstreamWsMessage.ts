import {
	discriminatedUnion,
	int,
	literal,
	object,
	positive,
	union,
	type z
} from 'zod/mini'
import { DownstreamWsMessageAction } from './DownstreamWsMessageAction'

export const DownstreamWsMessageSchema = discriminatedUnion('action', [
	object({
		action: union([
			literal(DownstreamWsMessageAction.OptimisticResolve),
			literal(DownstreamWsMessageAction.OptimisticCancel)
		]),
		id: int().check(positive())
	})
])
export type DownstreamWsMessage = z.infer<typeof DownstreamWsMessageSchema>
export const isDownstreamWsMessage = (
	obj: unknown
): obj is DownstreamWsMessage =>
	DownstreamWsMessageSchema.safeParse(obj).success
