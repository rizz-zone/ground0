import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { type } from 'arktype'
import { createTransitionSchema } from './transition_schema'
import { TransitionImpact } from '../types/transitions/TransitionImpact'

describe('createTransitionSchema', () => {
	it('accepts a regular zod transition schema', () => {
		const schema = z.discriminatedUnion('action', [
			z.object({
				action: z.literal('init'),
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
		const transitionSchema = createTransitionSchema(schema)

		expect(transitionSchema).toMatchObject(schema['~standard'])
	})
	it('accepts a regular arktype transition schema', () => {
		const schema = type({
			action: '"init"',
			impact: type.enumerated(TransitionImpact.LocalOnly)
		}).or({
			action: type.enumerated(3),
			impact: type.enumerated(TransitionImpact.OptimisticPush),
			data: {
				foo: 'string',
				bar: 'number'
			}
		})
		const transitionSchema = createTransitionSchema(schema)

		expect({
			vendor: transitionSchema.vendor,
			version: transitionSchema.version
		}).toMatchObject({
			vendor: schema['~standard'].vendor,
			version: schema['~standard'].version
		})
	})

	// Type tests - these won't fail in vitest if the corresponding 'accepts' tests didn't
	it('(TS) rejects an invalid zod transition schema', () => {
		const schema = z.object({
			action: z.object({
				definitelyInvalid: z.literal('1')
			})
		})
		// @ts-expect-error This is a test to see if TS *won't* accept a bad schema.
		const transitionSchema = createTransitionSchema(schema)

		expect(transitionSchema).toMatchObject(schema['~standard'])
	})
	it('(TS) rejects an invalid arktype transition schema', () => {
		const schema = type({
			action: {
				definitelyInvalid: '"1"'
			}
		})
		// @ts-expect-error This is a test to see if TS *won't* accept a bad schema.
		const transitionSchema = createTransitionSchema(schema)

		expect({
			vendor: transitionSchema.vendor,
			version: transitionSchema.version
		}).toMatchObject({
			vendor: schema['~standard'].vendor,
			version: schema['~standard'].version
		})
	})
})
