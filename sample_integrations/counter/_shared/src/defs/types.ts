import {
	createTransitionSchema,
	TransitionImpact,
	UpdateImpact,
	type Update
} from 'ground0'
import z from 'zod'

// Action enums
export enum TransitionAction {
	Increment,
	LocalIncrement
}
export enum UpdateAction {
	InitialValue,
	Increment
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

// Updates
export type AppUpdate = Update &
	(
		| {
				action: UpdateAction.InitialValue
				impact: UpdateImpact.Unreliable
				data: {
					value: number
				}
		  }
		| {
				action: UpdateAction.Increment
				impact: UpdateImpact.Unreliable
		  }
	)
