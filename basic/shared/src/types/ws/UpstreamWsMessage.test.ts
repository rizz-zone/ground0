import { describe, expect, test } from 'vitest'
import {
	isUpstreamWsMessage,
	UpstreamWsMessageSchema,
	type UpstreamWsMessage
} from './UpstreamWsMessage'
import { UpstreamWsMessageAction } from './UpstreamWsMessageAction'

describe('data validating to true', () => {
	test('valid init message', () => {
		const initMessage: UpstreamWsMessage = {
			action: UpstreamWsMessageAction.Init,
			version: '1.2.3'
		}
		expect(isUpstreamWsMessage(initMessage)).toBe(true)
		expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(true)
	})
})
describe('data validating to false', () => {
	test('empty message', () => {
		const initMessage = {}
		expect(isUpstreamWsMessage(initMessage)).toBe(false)
		expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(false)
	})
	test('init message with bad version format', () => {
		const initMessage: UpstreamWsMessage = {
			action: UpstreamWsMessageAction.Init,
			version: 'v1'
		}
		expect(isUpstreamWsMessage(initMessage)).toBe(false)
		expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(false)
	})
	test('init message with no version', () => {
		const initMessage: Omit<UpstreamWsMessage, 'version'> = {
			action: UpstreamWsMessageAction.Init
		}
		expect(isUpstreamWsMessage(initMessage)).toBe(false)
		expect(UpstreamWsMessageSchema.safeParse(initMessage).success).toBe(false)
	})
})
