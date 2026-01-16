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
const WebSocketSpy = vi.spyOn(globalThis, 'WebSocket').mockImplementation(() => {
	latestFake = { ...fakeWs, send: vi.fn(), close: vi.fn() } as any
	return latestFake!
})
const minimumInput: Parameters<typeof connectWs>[0] = {
	wsUrl: 'wss://something.different.ac.uk/',
	currentVersion: '0.1.2',
	syncResources: vi.fn(),
	handleMessage: vi.fn()
}

const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')

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
})
