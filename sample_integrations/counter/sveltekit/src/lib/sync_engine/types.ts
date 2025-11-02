import { createTransitionSchema, TransitionImpact } from 'ground0'
import z from 'zod'

// Action enum
export enum TransitionAction {
	Increment,
	LocalIncrement
}

// Transition schema
const sourceSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal(TransitionAction.Increment),
		impact: z.literal(TransitionImpact.OptimisticPush)
	}),
	z.object({
		action: z.literal(TransitionAction.LocalIncrement),
		impact: z.literal(TransitionImpact.LocalOnly)
	})
])
export const appTransitionSchema = createTransitionSchema(sourceSchema)
export type AppTransition = z.infer<typeof sourceSchema>

// Memory model shape
export type MemoryModel = {
	counter: number
}
