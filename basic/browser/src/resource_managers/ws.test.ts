import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
	type Mock
} from 'vitest'
import { connectWs } from './ws'
import {
	DownstreamWsMessageAction,
	UpstreamWsMessageAction,
	WsCloseCode,
	type DownstreamWsMessage,
	type UpstreamWsMessage
} from '@ground0/shared'
import SuperJSON from 'superjson'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'

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

const setInterval = vi.spyOn(globalThis, 'setInterval')
const clearInterval = vi.spyOn(globalThis, 'clearInterval')

beforeEach(() => connectWs(minimumInput))
afterEach(() => {
	vi.clearAllMocks()
	vi.clearAllTimers()
	latestFake = undefined
})

describe('usual process', () => {
	describe('init', () => {
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
		test('defines a ping interval', ({ skip }) => {
			if (!latestFake || !latestFake.onopen) return skip()
			expect(setInterval).not.toHaveBeenCalled()

			latestFake.onopen(new Event('open'))

			expect(setInterval).toHaveBeenCalledOnce()
		})
	})
	describe('onmessage', () => {
		test('handles "!" ping responses without calling handleMessage', ({
			skip
		}) => {
			if (!latestFake || !latestFake.onopen || !latestFake.onmessage)
				return skip()
			latestFake.onopen(new Event('open'))
			latestFake.onmessage(new MessageEvent('message', { data: '!' }))
			expect(minimumInput.handleMessage).not.toHaveBeenCalled()
		})
		test('passes regular messages to handleMessage', ({ skip }) => {
			if (!latestFake || !latestFake.onopen || !latestFake.onmessage)
				return skip()

			const message = new MessageEvent('message', {
				data: SuperJSON.stringify({
					action: DownstreamWsMessageAction.OptimisticResolve,
					id: 1
				} satisfies DownstreamWsMessage)
			})

			latestFake.onopen(new Event('open'))
			latestFake.onmessage(message)

			expect(minimumInput.handleMessage).toHaveBeenCalledExactlyOnceWith(
				message
			)
		})
		test('does not handle a message if we have moved onto a different socket', ({
			skip
		}) => {
			if (
				!latestFake ||
				!latestFake.onopen ||
				!latestFake.onmessage ||
				!latestFake.onclose
			)
				return skip()

			const messageEvent = new MessageEvent('message', {
				data: SuperJSON.stringify({
					action: DownstreamWsMessageAction.OptimisticResolve,
					id: 1
				} satisfies DownstreamWsMessage)
			})

			latestFake.onopen(new Event('open'))
			latestFake.onclose(new CloseEvent('close'))
			latestFake.onmessage(messageEvent)

			expect(minimumInput.handleMessage).not.toHaveBeenCalled()
		})
	})
	describe('onerror', () => {
		test('closes the current connection', ({ skip }) => {
			if (!latestFake || !latestFake.onopen || !latestFake.onerror)
				return skip()

			latestFake.onopen(new Event('open'))
			latestFake.onerror(new Event('error'))

			expect(latestFake.close).toHaveBeenCalledExactlyOnceWith(
				WsCloseCode.Error
			)
		})
		test('starts a new connection after the timeout', async ({ skip }) => {
			if (
				!latestFake ||
				!latestFake.onopen ||
				!latestFake.onerror ||
				!latestFake.onclose
			)
				return skip()

			expect(WebSocket).toHaveBeenCalledOnce()
			;(latestFake.close as Mock).mockImplementation(() =>
				latestFake?.onclose?.(new CloseEvent('close'))
			)

			latestFake.onopen(new Event('open'))
			latestFake.onerror(new Event('error'))
			vi.advanceTimersByTime(500)

			await vi.waitFor(() => {
				expect(WebSocket).toHaveBeenCalledTimes(2)
			})
		})
		test('does not close the socket if we have alreayd moved onto a different one', ({
			skip
		}) => {
			if (
				!latestFake ||
				!latestFake.onopen ||
				!latestFake.onerror ||
				!latestFake.onclose
			)
				return skip()

			latestFake.onopen(new Event('open'))
			latestFake.onclose(new CloseEvent('close'))
			latestFake.onerror(new Event('error'))

			expect(latestFake.close).not.toHaveBeenCalled()
		})
	})
	describe('onclose', () => {
		test('starts a new connection after the timeout', async ({ skip }) => {
			if (!latestFake || !latestFake.onopen || !latestFake.onclose)
				return skip()

			expect(WebSocket).toHaveBeenCalledOnce()

			latestFake.onopen(new Event('open'))
			latestFake.onclose(new CloseEvent('close'))
			vi.advanceTimersByTime(500)

			await vi.waitFor(() => {
				expect(WebSocket).toHaveBeenCalledTimes(2)
			})
		})
	})
})
describe('edge-cases', () => {
	test('ws closes if opened after a reconnect already happened', ({ skip }) => {
		if (!latestFake || !latestFake.onopen || !latestFake.onclose) return skip()

		expect(WebSocket).toHaveBeenCalledOnce()
		latestFake.onclose(new CloseEvent('close'))
		expect(latestFake.close).not.toHaveBeenCalled()

		latestFake.onopen(new Event('open'))
		expect(latestFake.close).toHaveBeenCalledExactlyOnceWith(
			WsCloseCode.SocketAppearsObsolete
		)
	})
})
describe('ping interval', () => {
	test('consists of a function and a number', ({ skip }) => {
		if (!latestFake || !latestFake.onopen) return skip()
		if (setInterval.mock.lastCall) return skip()
		latestFake.onopen(new Event('open'))
		if (!setInterval.mock.lastCall) return skip()
		expect(setInterval.mock.lastCall[0]).toBeTypeOf('function')
		expect(setInterval.mock.lastCall[1]).toBeTypeOf('number')
	})
	test('closes socket after three missed pings', ({ skip }) => {
		if (!latestFake || !latestFake.onopen) return skip()
		if (setInterval.mock.lastCall) return skip()
		latestFake.onopen(new Event('open'))
		if (!setInterval.mock.lastCall) return skip()
		const func = setInterval.mock.lastCall[0] as unknown as () => unknown

		for (let i = 0; i <= 4; i++) {
			func()
			if (i < 4) expect(latestFake.close).not.toHaveBeenCalled()
			else expect(latestFake.close).toHaveBeenCalledOnce()
		}
	})
	test('deletes interval if there is another socket in charge now', ({
		skip
	}) => {
		if (!latestFake || !latestFake.onopen || !latestFake.onclose) return skip()
		if (setInterval.mock.lastCall) return skip()
		latestFake.onopen(new Event('open'))
		if (!setInterval.mock.lastCall) return skip()

		const func = setInterval.mock.lastCall[0] as unknown as () => unknown
		const intervalId = setInterval.mock.results.at(-1)?.value as unknown
		func()
		expect(clearInterval).not.toHaveBeenCalled()
		latestFake.onclose(new CloseEvent('close'))
		expect(clearInterval).not.toHaveBeenCalled()

		func()
		expect(clearInterval).toHaveBeenCalledExactlyOnceWith(intervalId)
	})
})
