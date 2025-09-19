const transitionFn = vi.fn()
const mockWorkerLocalFirst = vi.fn().mockImplementation(() => ({
	memoryModel: {},
	transition: transitionFn
}))
vi.doMock('@/helpers/worker_thread', () => ({
	WorkerLocalFirst: mockWorkerLocalFirst
}))

import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi
} from 'vitest'
import { object, literal, type z } from 'zod'
import {
	createTransitionSchema,
	NoPortsError,
	TransitionImpact,
	type Transition
} from '@ground0/shared'
import type { LocalEngineDefinition } from '@/types/LocalEngineDefinition'
import type { WorkerLocalFirst } from '@/helpers/worker_thread'
import {
	DownstreamWorkerMessageType,
	type DownstreamWorkerMessage
} from '@/types/internal_messages/DownstreamWorkerMessage'
import {
	UpstreamWorkerMessageType,
	type UpstreamWorkerMessage
} from '@/types/internal_messages/UpstreamWorkerMessage'
const { workerEntrypoint } = await import('./general')

const sharedCtx = self as unknown as SharedWorkerGlobalScope
const dedicatedCtx = self as DedicatedWorkerGlobalScope

const postMessage = vi.fn()
dedicatedCtx.postMessage = postMessage

afterEach(vi.clearAllMocks)

const OurTransitionSchema = object({
	action: literal('abc'),
	impact: literal(TransitionImpact.LocalOnly)
})

const minimumInput: LocalEngineDefinition<
	Record<string, never>,
	z.infer<typeof OurTransitionSchema>
> = {
	engineDef: {
		transitions: {
			schema: createTransitionSchema(OurTransitionSchema),
			sharedHandlers: {}
		},
		version: {
			current: '1.2.3'
		},
		db: {
			migrations: {
				journal: {
					entries: [
						{
							idx: 0,
							when: 0,
							tag: 'something',
							breakpoints: true
						}
					]
				},
				migrations: { a: 'b' }
			}
		}
	},
	localHandlers: {
		abc: {
			editDb: () => {}
		}
	},
	initialMemoryModel: {},
	pullWasmBinary: async () => new ArrayBuffer(),
	wsUrl: 'wss://jerry.io/ws',
	dbName: 'dave'
}

describe('always', () => {
	test('creates a WorkerLocalFirst', ({ skip }) => {
		expect(mockWorkerLocalFirst).not.toHaveBeenCalled()
		workerEntrypoint(minimumInput)
		expect(mockWorkerLocalFirst).toHaveBeenCalledOnce()
		const call = mockWorkerLocalFirst.mock
			.lastCall?.[0] as ConstructorParameters<typeof WorkerLocalFirst>[0]
		if (!call) skip()
		expect(call.wsUrl).toBe(minimumInput.wsUrl)
		expect(call.dbName).toBe(minimumInput.dbName)
		expect(call.engineDef).toBe(minimumInput.engineDef)
		expect(call.localHandlers).toBe(minimumInput.localHandlers)
		expect(call.announceTransformation).toBeTypeOf('function')
		expect(call.pullWasmBinary).toBe(minimumInput.pullWasmBinary)
	})
})
describe('shared worker', () => {
	beforeEach(() => {
		sharedCtx.onconnect = null
	})
	afterAll(() => {
		// @ts-expect-error We can't just set it to undefined because it will
		// still exist in that case.
		delete dedicatedCtx.onconnect
	})
	describe('onconnect', () => {
		test('is set', () => {
			expect(sharedCtx.onconnect).not.toBeTypeOf('function')
			workerEntrypoint(minimumInput)
			expect(sharedCtx.onconnect).toBeTypeOf('function')
		})
		test('throws NoPortsError if no ports provided', ({ skip }) => {
			workerEntrypoint(minimumInput)
			expect(() => {
				if (typeof sharedCtx.onconnect !== 'function') return skip()
				sharedCtx.onconnect(new MessageEvent('connect'))
			}).toThrow(NoPortsError)
		})
		test('sets listeners and posts message to provided port', ({ skip }) => {
			workerEntrypoint(minimumInput)
			if (typeof sharedCtx.onconnect !== 'function') return skip()
			const channel = new MessageChannel()
			const portPostMessage = vi.fn()
			const mockPort1 = {
				...channel.port1,
				postMessage: portPostMessage
			}
			expect(mockPort1.onmessage).toBeUndefined()
			expect(mockPort1.onmessageerror).toBeUndefined()
			expect(portPostMessage).not.toHaveBeenCalled()
			sharedCtx.onconnect(new MessageEvent('connect', { ports: [mockPort1] }))
			expect(mockPort1.onmessage).toBeTypeOf('function')
			expect(mockPort1.onmessageerror).toBeTypeOf('function')
			expect(portPostMessage).toHaveBeenCalledExactlyOnceWith({
				type: DownstreamWorkerMessageType.InitMemoryModel,
				memoryModel: minimumInput.initialMemoryModel
			} satisfies DownstreamWorkerMessage<object>)
		})
		test('sets listeners and posts message to only one provided port', ({
			skip
		}) => {
			workerEntrypoint(minimumInput)
			if (typeof sharedCtx.onconnect !== 'function') return skip()
			const channel = new MessageChannel()
			const port1PostMessage = vi.fn()
			const port2PostMessage = vi.fn()
			const mockPort1 = {
				...channel.port1,
				postMessage: port1PostMessage
			}
			const mockPort2 = {
				...channel.port2,
				postMessage: port2PostMessage
			}
			expect(mockPort1.onmessage).toBeUndefined()
			expect(mockPort1.onmessageerror).toBeUndefined()
			expect(mockPort2.onmessage).toBeUndefined()
			expect(mockPort2.onmessageerror).toBeUndefined()
			expect(port1PostMessage).not.toHaveBeenCalled()
			expect(port2PostMessage).not.toHaveBeenCalled()
			sharedCtx.onconnect(
				new MessageEvent('connect', {
					ports: [mockPort1, mockPort2]
				})
			)
			expect(mockPort2.onmessage).toBeUndefined()
			expect(mockPort1.onmessage).toBeTypeOf('function')
			expect(mockPort1.onmessageerror).toBeTypeOf('function')
			expect(mockPort2.onmessageerror).toBeUndefined()
			expect(port1PostMessage).toHaveBeenCalledExactlyOnceWith({
				type: DownstreamWorkerMessageType.InitMemoryModel,
				memoryModel: minimumInput.initialMemoryModel
			} satisfies DownstreamWorkerMessage<object>)
			expect(port2PostMessage).not.toHaveBeenCalled()
		})
	})
	test('handles messages', ({ skip }) => {
		const consoleDebug = vi
			.spyOn(console, 'debug')
			.mockImplementationOnce(() => {})
		workerEntrypoint(minimumInput)
		expect(consoleDebug).not.toHaveBeenCalled()
		if (!sharedCtx.onconnect) return skip()

		const channel = new MessageChannel()
		sharedCtx.onconnect(new MessageEvent('connect', { ports: [channel.port1] }))
		if (!channel.port1.onmessage) return skip()

		const uuid = crypto.randomUUID()
		channel.port1.onmessage(
			new MessageEvent<UpstreamWorkerMessage<Transition>>('message', {
				data: { type: UpstreamWorkerMessageType.DebugLog, message: uuid }
			})
		)

		expect(consoleDebug).toHaveBeenCalledOnce()
		expect(consoleDebug.mock.lastCall).toContain(uuid)
	})
	test('handles messaging errors', ({ skip }) => {
		const consoleError = vi
			.spyOn(console, 'error')
			.mockImplementationOnce(() => {})
		workerEntrypoint(minimumInput)
		expect(consoleError).not.toHaveBeenCalled()
		if (!sharedCtx.onconnect) return skip()

		const channel = new MessageChannel()
		sharedCtx.onconnect(new MessageEvent('connect', { ports: [channel.port1] }))
		if (!channel.port1.onmessageerror) return skip()
		expect(consoleError).not.toHaveBeenCalled()

		channel.port1.onmessageerror(new MessageEvent('messageerror'))

		expect(consoleError).toHaveBeenCalledOnce()
	})
	// TODO: test message broadcasting
})
describe('dedicated worker', () => {
	const clearMessageListener = () => {
		dedicatedCtx.onmessage = null
		dedicatedCtx.onmessageerror = null
	}
	beforeEach(clearMessageListener)
	afterAll(clearMessageListener)
	test('on init, onmessage and onmessageerror are set and message is posted', () => {
		expect(dedicatedCtx.onmessage).not.toBeTypeOf('function')
		expect(dedicatedCtx.onmessageerror).not.toBeTypeOf('function')
		expect(postMessage).not.toHaveBeenCalled()
		workerEntrypoint(minimumInput)
		expect(dedicatedCtx.onmessage).toBeTypeOf('function')
		expect(dedicatedCtx.onmessageerror).toBeTypeOf('function')
		expect(postMessage).toHaveBeenCalledExactlyOnceWith({
			type: DownstreamWorkerMessageType.InitMemoryModel,
			memoryModel: minimumInput.initialMemoryModel
		} satisfies DownstreamWorkerMessage<object>)
	})
	test('handles messages', ({ skip }) => {
		const consoleDebug = vi
			.spyOn(console, 'debug')
			.mockImplementationOnce(() => {})
		workerEntrypoint(minimumInput)
		expect(consoleDebug).not.toHaveBeenCalled()
		if (!dedicatedCtx.onmessage) return skip()

		const uuid = crypto.randomUUID()
		dedicatedCtx.onmessage(
			new MessageEvent<UpstreamWorkerMessage<Transition>>('message', {
				data: { type: UpstreamWorkerMessageType.DebugLog, message: uuid }
			})
		)
		expect(consoleDebug).toHaveBeenCalledOnce()
		expect(consoleDebug.mock.lastCall).toContain(uuid)
	})
	test('handles messaging errors', ({ skip }) => {
		const consoleError = vi
			.spyOn(console, 'error')
			.mockImplementationOnce(() => {})
		workerEntrypoint(minimumInput)
		expect(consoleError).not.toHaveBeenCalled()
		if (!dedicatedCtx.onmessageerror) return skip()
		dedicatedCtx.onmessageerror(new MessageEvent('messageerror'))
		expect(consoleError).toHaveBeenCalledOnce()
	})
	// TODO: test message broadcasting
})
describe('message handling', ({ skip: skipSuite }) => {
	beforeAll(() => {
		skipSuite(
			"There is an issue with the SharedWorker implementation, so message handling can't be tested without unrelated issues showing up."
		)
	})
	test('', () => {})
})
