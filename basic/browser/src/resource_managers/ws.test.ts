import { afterEach, describe, expect, test, vi } from 'vitest'
import { connectWs } from './ws'

const fakeWs = {
	onopen: vi.fn(),
	onclose: vi.fn(),
	onmessage: vi.fn(),
	onerror: vi.fn(),
	send: vi.fn(),
	close: vi.fn()
} as unknown as WebSocket
const WebSocket = vi
	.spyOn(globalThis, 'WebSocket')
	.mockImplementation(() => fakeWs)
const minimumInput: Parameters<typeof connectWs>[0] = {
	wsUrl: 'wss://something.different.ac.uk/',
	currentVersion: '0.1.2',
	syncResources: vi.fn(),
	handleMessage: vi.fn()
}

afterEach(vi.clearAllMocks)

describe('regular init', () => {
	test('requests websocket', () => {
		connectWs(minimumInput)
		expect(WebSocket).not.toHaveBeenCalled()
		return new Promise<void>((resolve, reject) =>
			setImmediate(() => {
				try {
					expect(WebSocket).toHaveBeenCalledOnce()
					resolve()
				} catch (e) {
					reject(e)
				}
			})
		)
	})
})
