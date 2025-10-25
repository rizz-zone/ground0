import { discriminatedUnion, int, literal, object, gte, union } from 'zod/mini'
import { DownstreamWsMessageAction } from '../../types/ws/DownstreamWsMessageAction'
import type { DownstreamWsMessage } from '@/types/ws/DownstreamWsMessage'

export const DownstreamWsMessageSchema = discriminatedUnion('action', [
	object({
		action: union([
			literal(DownstreamWsMessageAction.OptimisticResolve),
			literal(DownstreamWsMessageAction.OptimisticCancel)
		]),
		id: int().check(gte(0))
	})
])
export const isDownstreamWsMessage = (
	obj: unknown
): obj is DownstreamWsMessage =>
	DownstreamWsMessageSchema.safeParse(obj).success
