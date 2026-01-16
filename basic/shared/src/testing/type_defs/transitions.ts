/* v8 ignore start */

import z from 'zod'
import { createTransitionSchema } from '../../exports/transition_schema'
import { TransitionImpact } from '../../types/transitions/TransitionImpact'

const schema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('shift_foo_bar'),
		impact: z.literal(TransitionImpact.LocalOnly)
	}),
	z.object({
		action: z.literal(3),
		impact: z.literal(TransitionImpact.OptimisticPush),
		data: z.object({
			foo: z.string(),
			bar: z.number()
		})
	})
])
export const testingTransitionSchema = createTransitionSchema(schema)
export type TestingTransition = z.infer<typeof schema>
