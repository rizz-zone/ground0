import { describe, test, expect } from 'vitest'
import { TransitionImpact } from '../../types/transitions/TransitionImpact'
import { isTransition, TransitionSchema } from './Transition'
import type { Transition } from '@/types/transitions/Transition'

describe('valid data', () => {
	describe('with string action', () => {
		test('with data', () => {
			const transition: Transition = {
				action: 'some string action',
				impact: TransitionImpact.OptimisticPush,
				data: {
					foo: '35',
					bar: 35,
					baz: new Date(35)
				}
			}
			expect(isTransition(transition)).toBe(true)
			expect(TransitionSchema.safeParse(transition).success).toBe(true)
		})
		test('without data', () => {
			const transition: Transition = {
				action: 'some string action',
				impact: TransitionImpact.OptimisticPush
			}
			expect(isTransition(transition)).toBe(true)
			expect(TransitionSchema.safeParse(transition).success).toBe(true)
		})
	})
	describe('with integer action', () => {
		test('with data', () => {
			const transition: Transition = {
				action: 19,
				impact: TransitionImpact.OptimisticPush,
				data: {
					foo: '35',
					bar: 35,
					baz: new Date(35)
				}
			}
			expect(isTransition(transition)).toBe(true)
			expect(TransitionSchema.safeParse(transition).success).toBe(true)
		})
		test('without data', () => {
			const transition: Transition = {
				action: 19,
				impact: TransitionImpact.OptimisticPush
			}
			expect(isTransition(transition)).toBe(true)
			expect(TransitionSchema.safeParse(transition).success).toBe(true)
		})
	})
})
describe('invalid data', () => {
	test('non-integer number action', () => {
		const transition: Transition = {
			action: 19.3,
			impact: TransitionImpact.OptimisticPush
		}
		expect(isTransition(transition)).toBe(false)
		expect(TransitionSchema.safeParse(transition).success).toBe(false)
	})
	test('nonexistent impact', () => {
		const transition = {
			action: 19,
			impact: Number.MAX_SAFE_INTEGER
		}
		expect(isTransition(transition)).toBe(false)
		expect(TransitionSchema.safeParse(transition).success).toBe(false)
	})
})
