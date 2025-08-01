import { discriminatedUnion, literal, number, object } from 'zod/mini'
import { DownstreamWsMessageAction } from './DownstreamWsMessageAction'

export const DownstreamWsMessageSchema = discriminatedUnion('action', [
	object({
		action: literal(DownstreamWsMessageAction.OptimisticResolve),
		id: number()
	})
])
