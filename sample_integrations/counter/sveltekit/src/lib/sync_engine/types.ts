import { createTransitionSchema, TransitionImpact } from 'ground0'
import z from 'zod'

const sourceSchema = z.object({
	action: z.literal('abc'),
	impact: z.literal(TransitionImpact.LocalOnly)
})
type MemoryModel = {
	counter: number
}

export const appTransitionSchema = createTransitionSchema(sourceSchema)

export type AppTransition = z.infer<typeof sourceSchema>
export type { MemoryModel }
