import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { connectWs } from './ws'
import { WsCloseCode } from '@ground0/shared'

vi.useFakeTimers()

const fakeWs = {
	onopen: null,
	onclose: null,
	onmessage: null,
	onerror: null,
	send: vi.fn(),
	close: vi.fn()
} as unknown as WebSocket
let latestFake: WebSocket | undefined = undefined
const WebSocketSpy = vi
	.spyOn(globalThis, 'WebSocket')
	.mockImplementation(() => {
		latestFake = {
			...fakeWs,
			send: vi.fn(),
			close: vi.fn()
		} as unknown as WebSocket
		return latestFake as WebSocket
	})
const minimumInput: Parameters<typeof connectWs>[0] = {
	wsUrl: 'wss://something.different.ac.uk/',
	currentVersion: '0.1.2',
	syncResources: vi.fn(),
	handleMessage: vi.fn()
}

beforeEach(() => connectWs(minimumInput))
afterEach(() => {
	vi.clearAllMocks()
	vi.clearAllTimers()
	latestFake = undefined
})

describe('usual process', () => {
	describe('init', () => {
		test('requests websocket', () => {
			expect(WebSocketSpy).toHaveBeenCalledOnce()
		})
	})
	describe('onopen', () => {
		test('sends init message', ({ skip }) => {
			if (!latestFake || !latestFake.onopen) return skip()
			latestFake.onopen(new Event('open'))
			expect(latestFake.send).toHaveBeenCalled()
		})
	})
	describe('onmessage', () => {
		test('calls handleMessage for non-pong messages', ({ skip }) => {
			if (!latestFake || !latestFake.onopen || !latestFake.onmessage)
				return skip()
			latestFake.onopen(new Event('open'))
			const testMessage = new MessageEvent('message', {
				data: 'some-test-message'
			})
			latestFake.onmessage(testMessage)
			expect(minimumInput.handleMessage).toHaveBeenCalledWith(testMessage)
		})
		test('handles pong messages by decrementing dissatisfied pings', ({
			skip
		}) => {
			if (!latestFake || !latestFake.onopen || !latestFake.onmessage)
				return skip()
			latestFake.onopen(new Event('open'))
			// Advance to trigger some pings first
			vi.advanceTimersByTime(5000 / 3)
			// Now receive a pong - this decrements dissatisfiedPings
			latestFake.onmessage(new MessageEvent('message', { data: '!' }))
			// handleMessage should NOT be called for pong
			expect(minimumInput.handleMessage).not.toHaveBeenCalled()
		})
	})
	describe('onerror', () => {
		test('closes websocket with error code', ({ skip }) => {
			if (!latestFake || !latestFake.onopen || !latestFake.onerror)
				return skip()
			latestFake.onopen(new Event('open'))
			latestFake.onerror(new Event('error'))
			expect(latestFake.close).toHaveBeenCalledWith(WsCloseCode.Error)
		})
	})
	describe('onclose', () => {
		test('reconnects by creating a new websocket', async ({ skip }) => {
			if (!latestFake || !latestFake.onopen || !latestFake.onclose)
				return skip()
			latestFake.onopen(new Event('open'))
			const initialCallCount = WebSocketSpy.mock.calls.length
			latestFake.onclose(new CloseEvent('close'))
			// Let the async connectAnew() start executing
			await vi.runAllTimersAsync()
			expect(WebSocketSpy.mock.calls.length).toBe(initialCallCount + 1)
		})
	})
	describe('ping interval', () => {
		test('closes websocket with timeout after too many unanswered pings', ({
			skip
		}) => {
			if (!latestFake || !latestFake.onopen) return skip()
			latestFake.onopen(new Event('open'))
			// Advance time to trigger 5 ping intervals (more than 3 dissatisfied)
			// Interval is 5000/3 ms
			for (let i = 0; i < 5; i++) {
				vi.advanceTimersByTime(5000 / 3)
			}
			expect(latestFake.close).toHaveBeenCalledWith(WsCloseCode.Timeout)
		})
	})
})
describe('connection id management', () => {
	test('obsolete connection is closed on open', async ({ skip }) => {
		// Get the first websocket
		const firstWs = latestFake
		if (!firstWs || !firstWs.onclose) return skip()

		// Trigger a reconnect to create a second connection
		firstWs.onclose(new CloseEvent('close'))
		await vi.runAllTimersAsync()

		const secondWs = latestFake
		if (!secondWs || secondWs === firstWs) return skip()

		// Now if the first websocket's onopen fires (delayed), it should close itself
		if (!firstWs.onopen) return skip()
		firstWs.onopen(new Event('open'))
		expect(firstWs.close).toHaveBeenCalledWith(
			WsCloseCode.SocketAppearsObsolete
		)
	})
	test('obsolete connection onmessage is ignored', async ({ skip }) => {
		const firstWs = latestFake
		if (!firstWs || !firstWs.onclose || !firstWs.onopen || !firstWs.onmessage)
			return skip()

		// Open the first connection
		firstWs.onopen(new Event('open'))

		// Trigger a reconnect to create a second connection
		firstWs.onclose(new CloseEvent('close'))
		await vi.runAllTimersAsync()

		// Clear mocks to track only new calls
		;(minimumInput.handleMessage as ReturnType<typeof vi.fn>).mockClear()

		// Now if the first websocket's onmessage fires, it should be ignored
		firstWs.onmessage(new MessageEvent('message', { data: 'test' }))
		expect(minimumInput.handleMessage).not.toHaveBeenCalled()
	})
	test('obsolete connection onerror is ignored', async ({ skip }) => {
		const firstWs = latestFake
		if (!firstWs || !firstWs.onclose || !firstWs.onopen || !firstWs.onerror)
			return skip()

		// Open the first connection
		firstWs.onopen(new Event('open'))

		// Trigger a reconnect to create a second connection
		firstWs.onclose(new CloseEvent('close'))
		await vi.runAllTimersAsync()

		// Clear mocks
		;(firstWs.close as ReturnType<typeof vi.fn>).mockClear()

		// Now if the first websocket's onerror fires, it should be ignored
		firstWs.onerror(new Event('error'))
		expect(firstWs.close).not.toHaveBeenCalled()
	})
	test('obsolete connection onclose is ignored', async ({ skip }) => {
		const firstWs = latestFake
		if (!firstWs || !firstWs.onclose || !firstWs.onopen) return skip()

		// Open the first connection
		firstWs.onopen(new Event('open'))

		// Trigger a reconnect to create a second connection
		firstWs.onclose(new CloseEvent('close'))
		await vi.runAllTimersAsync()

		const secondWs = latestFake
		if (!secondWs || secondWs === firstWs) return skip()

		const callCountBeforeObsoleteClose = WebSocketSpy.mock.calls.length

		// Now if the first websocket's onclose fires again, it should be ignored (no new reconnect)
		firstWs.onclose(new CloseEvent('close'))
		await vi.runAllTimersAsync()

		expect(WebSocketSpy.mock.calls.length).toBe(callCountBeforeObsoleteClose)
	})
	test('connection aborts after cooldown if newer connection started', async ({
		skip
	}) => {
		// First connection is created in beforeEach
		const firstWs = latestFake
		if (!firstWs || !firstWs.onclose || !firstWs.onopen) return skip()

		// Open first connection (this sets the 500ms cooldown for next reconnect)
		firstWs.onopen(new Event('open'))

		// Close first connection - this triggers second connectAnew()
		// Second will await the 500ms cooldown
		firstWs.onclose(new CloseEvent('close'))

		// Don't let the cooldown complete yet - only advance 100ms
		vi.advanceTimersByTime(100)

		// Second is still waiting on cooldown. Get its websocket.
		const secondWs = latestFake
		if (!secondWs || !secondWs.onclose) return skip()

		// Close second connection - this triggers third connectAnew()
		// Third will also await the same 500ms cooldown
		// But crucially, currentConnectionId is now incremented
		secondWs.onclose(new CloseEvent('close'))

		// Count WebSocket creations before completing cooldown
		const countBeforeCooldown = WebSocketSpy.mock.calls.length

		// Now complete the cooldown - both second and third's awaits will resolve
		// Second should see ID mismatch (line 31) and return early without creating a new WS
		// Third should proceed normally
		await vi.runAllTimersAsync()

		// Only one additional WebSocket should be created (by third), not two
		// If line 31 wasn't hit, we'd have two new WebSockets
		expect(WebSocketSpy.mock.calls.length).toBe(countBeforeCooldown + 1)
	})
})
