import { describe, expect, test } from 'vitest'
import {
	DownstreamWsMessageSchema,
	isDownstreamWsMessage,
	type DownstreamWsMessage
} from './DownstreamWsMessage'
import { DownstreamWsMessageAction } from './DownstreamWsMessageAction'

describe('valid messages', () => {
	describe('optimistic confirmations', () => {
		test('resolve', () => {
			const message: DownstreamWsMessage = {
				action: DownstreamWsMessageAction.OptimisticResolve,
				id: 0
			}
			expect(isDownstreamWsMessage(message)).toBe(true)
			expect(DownstreamWsMessageSchema.safeParse(message).success).toBe(true)
		})
		test('cancel', () => {
			const message: DownstreamWsMessage = {
				action: DownstreamWsMessageAction.OptimisticCancel,
				id: 0
			}
			expect(isDownstreamWsMessage(message)).toBe(true)
			expect(DownstreamWsMessageSchema.safeParse(message).success).toBe(true)
		})
	})
})
describe('invalid messages', () => {
	describe('optimistic confirmations', () => {
		describe('resolve', () => {
			test('with non-int number', () => {
				const message: DownstreamWsMessage = {
					action: DownstreamWsMessageAction.OptimisticResolve,
					id: 25.2
				}
				expect(isDownstreamWsMessage(message)).toBe(false)
				expect(DownstreamWsMessageSchema.safeParse(message).success).toBe(false)
			})
			test('with negative number', () => {
				const message: DownstreamWsMessage = {
					action: DownstreamWsMessageAction.OptimisticResolve,
					id: -1
				}
				expect(isDownstreamWsMessage(message)).toBe(false)
				expect(DownstreamWsMessageSchema.safeParse(message).success).toBe(false)
			})
		})
		describe('cancel', () => {
			test('with non-int number', () => {
				const message: DownstreamWsMessage = {
					action: DownstreamWsMessageAction.OptimisticCancel,
					id: 25.2
				}
				expect(isDownstreamWsMessage(message)).toBe(false)
				expect(DownstreamWsMessageSchema.safeParse(message).success).toBe(false)
			})
			test('with negative number', () => {
				const message: DownstreamWsMessage = {
					action: DownstreamWsMessageAction.OptimisticCancel,
					id: -1
				}
				expect(isDownstreamWsMessage(message)).toBe(false)
				expect(DownstreamWsMessageSchema.safeParse(message).success).toBe(false)
			})
		})
	})
})
