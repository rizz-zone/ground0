import { TransitionImpact } from '@ground0/shared'
import { afterAll, describe, expect, test } from 'vitest'
import { runners } from './all'

const previousRunners: (typeof runners)[keyof typeof runners][] = []

for (const [key, value] of Object.entries(TransitionImpact).filter(([k]) =>
	isNaN(Number(k))
)) {
	if (typeof key === 'number' || typeof value === 'string')
		throw new Error('Filtering failed somehow?')
	describe(`${key} runner`, () => {
		afterAll(() => {
			previousRunners.push(runners[value])
		})
		test('present', () => {
			// `value` is definitely not a string, but Vitest's types are
			// wrong here.
			expect(runners).toHaveProperty(value as unknown as string)
			// It's a function instead of an object because it's a constructor.
			expect(runners[value]).toBeTypeOf('function')
		})
		test('not the same as any previous runner', () => {
			for (const runner of previousRunners) {
				expect(runners[value]).not.toBe(runner)
			}
		})
	})
}
