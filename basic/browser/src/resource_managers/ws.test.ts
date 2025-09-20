import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { connectWs } from './ws'
import {
	UpstreamWsMessageAction,
	type UpstreamWsMessage
} from '@ground0/shared'
import SuperJSON from 'superjson'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'

const fakeWs = {
	onopen: null,
	onclose: null,
	onmessage: null,
	onerror: null,
	send: vi.fn(),
	close: vi.fn()
} as unknown as WebSocket
let latestFake: WebSocket | undefined = undefined
const WebSocket = vi.spyOn(globalThis, 'WebSocket').mockImplementation(() => {
	latestFake = { ...fakeWs }
	return latestFake
})
const minimumInput: Parameters<typeof connectWs>[0] = {
	wsUrl: 'wss://something.different.ac.uk/',
	currentVersion: '0.1.2',
	syncResources: vi.fn(),
	handleMessage: vi.fn()
}

afterEach(() => {
	vi.clearAllMocks()
	latestFake = undefined
})

describe('regular init', () => {
	beforeEach(() => connectWs(minimumInput))
	test('requests websocket', () => {
		expect(WebSocket).toHaveBeenCalledOnce()
	})
	test('sets all handlers', ({ skip }) => {
		if (!latestFake) return skip()

		expect(latestFake.onopen).toBeTypeOf('function')
		expect(latestFake.onmessage).toBeTypeOf('function')
		expect(latestFake.onerror).toBeTypeOf('function')
		expect(latestFake.onclose).toBeTypeOf('function')
	})
	describe('onopen', () => {
		test('sends init message', ({ skip }) => {
			if (!latestFake || !latestFake.onopen) return skip()
			expect(latestFake.send).not.toHaveBeenCalled()

			latestFake.onopen(new Event('open'))

			expect(latestFake.send).toHaveBeenCalledExactlyOnceWith(
				SuperJSON.stringify({
					action: UpstreamWsMessageAction.Init,
					version: minimumInput.currentVersion
				} satisfies UpstreamWsMessage)
			)
		})
		test('syncs resources', ({ skip }) => {
			if (!latestFake || !latestFake.onopen) return skip()
			expect(minimumInput.syncResources).toHaveBeenCalledExactlyOnceWith({
				ws: { status: WsResourceStatus.Disconnected }
			} satisfies Partial<ResourceBundle>)

			latestFake.onopen(new Event('open'))

			expect(minimumInput.syncResources).toHaveBeenCalledTimes(2)
			expect(minimumInput.syncResources).toHaveBeenLastCalledWith({
				ws: {
					status: WsResourceStatus.Connected,
					instance: latestFake
				}
			} satisfies Partial<ResourceBundle>)
		})
	})
})
