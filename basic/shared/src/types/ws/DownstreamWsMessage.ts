import type { DownstreamWsMessageSchema } from '@/zod/ws/DownstreamWsMessage'
import type { z } from 'zod/mini'

export type DownstreamWsMessage = z.infer<typeof DownstreamWsMessageSchema>
