import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { connectWs } from './ws'
import {
	UpstreamWsMessageAction,
	type UpstreamWsMessage
} from '@ground0/shared'
import SuperJSON from 'superjson'

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

function macrotask(callback: () => unknown): Promise<void> {
	return new Promise<void>((resolve, reject) =>
		setImmediate(() => {
			try {
				const c = callback()
				if (
					c &&
					typeof c === 'object' &&
					'then' in c &&
					typeof c.then === 'function'
				) {
					c.then(resolve, reject)
					return
				}
				resolve()
			} catch (e) {
				reject(e)
			}
		})
	)
}

describe('regular init', () => {
	beforeEach(() => connectWs(minimumInput))
	test('requests websocket', () => {
		expect(WebSocket).not.toHaveBeenCalled()
		return macrotask(() => expect(WebSocket).toHaveBeenCalledOnce())
	})
	test('sets all handlers', ({ skip }) =>
		macrotask(() => {
			if (!latestFake) return skip()

			expect(latestFake.onopen).toBeTypeOf('function')
			expect(latestFake.onmessage).toBeTypeOf('function')
			expect(latestFake.onerror).toBeTypeOf('function')
			expect(latestFake.onclose).toBeTypeOf('function')
		}))
	test('sends init message on open', ({ skip }) =>
		macrotask(() => {
			if (!latestFake || !latestFake.onopen) return skip()
			expect(latestFake.send).not.toHaveBeenCalled()

			latestFake.onopen(new Event('open'))

			expect(latestFake.send).toHaveBeenCalledExactlyOnceWith(
				SuperJSON.stringify({
					action: UpstreamWsMessageAction.Init,
					version: minimumInput.currentVersion
				} satisfies UpstreamWsMessage)
			)
		}))
})
