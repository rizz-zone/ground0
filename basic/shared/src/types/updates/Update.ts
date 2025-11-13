import type { UpdateSchema } from '@/zod/updates/Update'
import type { z } from 'zod/mini'

export type Update = z.infer<typeof UpdateSchema>
