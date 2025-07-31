import { describe, expect, test } from 'vitest'
import {
	isUpstreamWsMessage,
	UpstreamWsMessageSchema,
	type UpstreamWsMessage
} from './UpstreamWsMessage'
import { UpstreamWsMessageAction } from './UpstreamWsMessageAction'
import { TransitionImpact } from '../transitions/TransitionImpact'

describe('valid messages', () => {
	test('init', () => {
		const initMessage: UpstreamWsMessage = {
			action: UpstreamWsMessageAction.Init,
			version: '1.2.3'
		}
		expect(isUpstreamWsMessage(initMessage)).toBe(true)
		expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(true)
	})
	describe('transition', () => {
		describe('with string action', () => {
			test('with data', () => {
				const initMessage: UpstreamWsMessage = {
					action: UpstreamWsMessageAction.Transition,
					data: {
						action: 'some string action',
						impact: TransitionImpact.OptimisticPush,
						data: {
							foo: '35',
							bar: 35,
							baz: new Date(35)
						}
					}
				}
				expect(isUpstreamWsMessage(initMessage)).toBe(true)
				expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(
					true
				)
			})
			test('without data', () => {
				const initMessage: UpstreamWsMessage = {
					action: UpstreamWsMessageAction.Transition,
					data: {
						action: 'some string action',
						impact: TransitionImpact.OptimisticPush
					}
				}
				expect(isUpstreamWsMessage(initMessage)).toBe(true)
				expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(
					true
				)
			})
		})
		describe('with integer action', () => {
			test('with data', () => {
				const initMessage: UpstreamWsMessage = {
					action: UpstreamWsMessageAction.Transition,
					data: {
						action: 19,
						impact: TransitionImpact.OptimisticPush,
						data: {
							foo: '35',
							bar: 35,
							baz: new Date(35)
						}
					}
				}
				expect(isUpstreamWsMessage(initMessage)).toBe(true)
				expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(
					true
				)
			})
			test('without data', () => {
				const initMessage: UpstreamWsMessage = {
					action: UpstreamWsMessageAction.Transition,
					data: {
						action: 19,
						impact: TransitionImpact.OptimisticPush
					}
				}
				expect(isUpstreamWsMessage(initMessage)).toBe(true)
				expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(
					true
				)
			})
		})
	})
})
describe('invalid messages', () => {
	test('empty message', () => {
		const initMessage = {}
		expect(isUpstreamWsMessage(initMessage)).toBe(false)
		expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(false)
	})
	test('nonexistent action', () => {
		const initMessage = {
			action: Number.MAX_SAFE_INTEGER
		}
		expect(isUpstreamWsMessage(initMessage)).toBe(false)
		expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(false)
	})
	describe('init', () => {
		test('bad version format', () => {
			const initMessage: UpstreamWsMessage = {
				action: UpstreamWsMessageAction.Init,
				version: 'v1.3'
			}
			expect(isUpstreamWsMessage(initMessage)).toBe(false)
			expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(false)
		})
		test('no version', () => {
			const initMessage: Omit<UpstreamWsMessage, 'version'> = {
				action: UpstreamWsMessageAction.Init
			}
			expect(isUpstreamWsMessage(initMessage)).toBe(false)
			expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(false)
		})
	})
	describe('transition', () => {
		test('no transition data', () => {
			const initMessage: Omit<UpstreamWsMessage, 'data'> = {
				action: UpstreamWsMessageAction.Transition
			}
			expect(isUpstreamWsMessage(initMessage)).toBe(false)
			expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(false)
		})
		test('non-integer number action', () => {
			const initMessage: UpstreamWsMessage = {
				action: UpstreamWsMessageAction.Transition,
				data: {
					action: 19.3,
					impact: TransitionImpact.OptimisticPush
				}
			}
			expect(isUpstreamWsMessage(initMessage)).toBe(false)
			expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(false)
		})
		test('irrelevant transition', () => {
			const initMessage: UpstreamWsMessage = {
				action: UpstreamWsMessageAction.Transition,
				data: {
					action: 19,
					impact: TransitionImpact.LocalOnly
				}
			}
			expect(isUpstreamWsMessage(initMessage)).toBe(false)
			expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(false)
		})
		test('nonexistent transition impact', () => {
			const initMessage = {
				action: UpstreamWsMessageAction.Transition,
				data: {
					action: 19,
					impact: Number.MAX_SAFE_INTEGER
				}
			}
			expect(isUpstreamWsMessage(initMessage)).toBe(false)
			expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(false)
		})
	})
})
