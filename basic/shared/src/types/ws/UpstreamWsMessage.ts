import type { UpstreamWsMessageSchema } from '@/zod/ws/UpstreamWsMessage'
import type { z } from 'zod/mini'

export type UpstreamWsMessage = z.infer<typeof UpstreamWsMessageSchema>
