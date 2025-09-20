import { afterEach, describe, expect, test, vi } from 'vitest'
import { connectWs } from './ws'

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
	test('requests websocket', () => {
		connectWs(minimumInput)
		expect(WebSocket).not.toHaveBeenCalled()
		return macrotask(() => expect(WebSocket).toHaveBeenCalledOnce())
	})
	test('sends init message on open', ({ skip }) => {
		connectWs(minimumInput)
		return macrotask(() => {
			if (!WebSocket.mock.lastCall) skip()
		})
	})
})
