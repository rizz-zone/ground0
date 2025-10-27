import { createTransitionSchema, TransitionImpact } from 'ground0'
import z from 'zod'

// Action enum
export enum TransitionAction {
	Increment
}

// Transition schema
const sourceSchema = z.object({
	action: z.literal(TransitionAction.Increment),
	impact: z.literal(TransitionImpact.OptimisticPush)
})
export const appTransitionSchema = createTransitionSchema(sourceSchema)
export type AppTransition = z.infer<typeof sourceSchema>

// Memory model shape
export type MemoryModel = {
	counter: number
}
