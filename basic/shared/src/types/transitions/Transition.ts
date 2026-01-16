import type { TransitionSchema } from '@/zod/transitions/Transition'
import type { z } from 'zod/mini'

export type Transition = z.infer<typeof TransitionSchema>
