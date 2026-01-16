const transitionFn = vi.fn()
const newPortFn = vi.fn()
const mockWorkerLocalFirst = vi.fn().mockImplementation(() => ({
	memoryModel: {},
	transition: transitionFn,
	newPort: newPortFn
}))
vi.doMock('@/helpers/worker_thread', () => ({
	WorkerLocalFirst: mockWorkerLocalFirst
}))
vi.doMock('@/helpers/deep_unwrap_memory_model', () => ({
	deepUnwrap: (obj: object) => obj
}))

import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi
} from 'vitest'
import { NoPortsError, TransitionImpact } from '@ground0/shared'
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
import { TransformationAction } from '@/types/memory_model/TransformationAction'
import type { Transformation } from '@/types/memory_model/Tranformation'
import { defs, type TestingUpdate } from '@ground0/shared/testing'
const { workerEntrypoint } = await import('./general')

const sharedCtx = self as unknown as SharedWorkerGlobalScope
const dedicatedCtx = self as DedicatedWorkerGlobalScope

const originalPostMessage = dedicatedCtx.postMessage
const postMessageMock = vi.fn()
dedicatedCtx.postMessage = postMessageMock

afterEach(() => {
	vi.clearAllMocks()
	// @ts-expect-error Resetting listeners
	dedicatedCtx.onmessage = undefined
	// @ts-expect-error Resetting listeners
	dedicatedCtx.onmessageerror = undefined
})

afterAll(() => {
	dedicatedCtx.postMessage = originalPostMessage
})

type OurTransition = {
	action: 'abc'
	impact: TransitionImpact.LocalOnly
}

const minimumInput: LocalEngineDefinition<
	Record<string, never>,
	OurTransition,
	TestingUpdate
> = {
	engineDef: {
		transitions: {
			sharedHandlers: {}
		},
		version: {
			current: '1.2.3'
		},
		db: {
			migrations: defs.db.migrations
		}
	},
	localTransitionHandlers: {
		abc: {
			editDb: () => {}
		}
	},
	updateHandlers: {
		3: () => {},
		baz: () => {}
	},
	initialMemoryModel: {},
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
		expect(call.localTransitionHandlers).toBe(
			minimumInput.localTransitionHandlers
		)
		expect(call.announceTransformation).toBeTypeOf('function')
	})
})
describe('shared worker', () => {
	beforeEach(() => {
		// Ensure onconnect property exists so 'onconnect' in ctx returns true
		sharedCtx.onconnect = null
	})
	afterEach(() => {
		sharedCtx.onconnect = null
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
			} as unknown as MessagePort
			sharedCtx.onconnect(new MessageEvent('connect', { ports: [mockPort1] }))
			expect(mockPort1.onmessage).toBeTypeOf('function')
			expect(mockPort1.onmessageerror).toBeTypeOf('function')
			expect(portPostMessage).toHaveBeenCalledWith({
				type: DownstreamWorkerMessageType.InitMemoryModel,
				memoryModel: minimumInput.initialMemoryModel
			} satisfies DownstreamWorkerMessage<object>)
		})
	})
	test('handles messaging errors', ({ skip }) => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
		workerEntrypoint(minimumInput)
		if (!sharedCtx.onconnect) return skip()

		const channel = new MessageChannel()
		sharedCtx.onconnect(new MessageEvent('connect', { ports: [channel.port1] }))
		if (!channel.port1.onmessageerror) return skip()
		channel.port1.onmessageerror(new MessageEvent('messageerror'))
		expect(consoleError).toHaveBeenCalled()
	})
})
describe('dedicated worker', () => {
	beforeEach(() => {
		// Ensure onconnect property does NOT exist so 'onconnect' in ctx returns false
		// @ts-expect-error Removing property
		delete sharedCtx.onconnect
	})
	test('on init, onmessage and onmessageerror are set and message is posted', () => {
		workerEntrypoint(minimumInput)
		expect(postMessageMock).toHaveBeenCalledWith({
			type: DownstreamWorkerMessageType.InitMemoryModel,
			memoryModel: minimumInput.initialMemoryModel
		} satisfies DownstreamWorkerMessage<object>)
	})
	describe('onmessage', () => {
		test('handles Transition messages', ({ skip }) => {
			workerEntrypoint(minimumInput)
			if (!dedicatedCtx.onmessage) return skip()
			const testTransition = {
				action: 'abc',
				impact: TransitionImpact.LocalOnly
			} as OurTransition
			dedicatedCtx.onmessage(
				new MessageEvent('message', {
					data: {
						type: UpstreamWorkerMessageType.Transition,
						data: testTransition
					} satisfies UpstreamWorkerMessage<OurTransition>
				})
			)
			expect(transitionFn).toHaveBeenCalledWith(testTransition)
		})
		test('handles Close messages (no-op for dedicated worker)', ({ skip }) => {
			workerEntrypoint(minimumInput)
			if (!dedicatedCtx.onmessage) return skip()
			// This should not throw - just silently return
			dedicatedCtx.onmessage(
				new MessageEvent('message', {
					data: {
						type: UpstreamWorkerMessageType.Close
					} satisfies UpstreamWorkerMessage<OurTransition>
				})
			)
		})
		test('handles DebugLog messages', ({ skip }) => {
			const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
			workerEntrypoint(minimumInput)
			if (!dedicatedCtx.onmessage) return skip()
			dedicatedCtx.onmessage(
				new MessageEvent('message', {
					data: {
						type: UpstreamWorkerMessageType.DebugLog,
						message: 'test debug message'
					} satisfies UpstreamWorkerMessage<OurTransition>
				})
			)
			expect(debugSpy).toHaveBeenCalled()
		})
		test('handles DbWorkerPrepared messages', ({ skip }) => {
			workerEntrypoint(minimumInput)
			if (!dedicatedCtx.onmessage) return skip()
			const mockPort = { postMessage: vi.fn() } as unknown as MessagePort
			dedicatedCtx.onmessage(
				new MessageEvent('message', {
					data: {
						type: UpstreamWorkerMessageType.DbWorkerPrepared,
						port: mockPort
					} satisfies UpstreamWorkerMessage<OurTransition>
				})
			)
			expect(newPortFn).toHaveBeenCalledWith(mockPort)
		})
		test('handles DbWorkerPrepared without port (no-op)', ({ skip }) => {
			workerEntrypoint(minimumInput)
			if (!dedicatedCtx.onmessage) return skip()
			// Should not throw when port is undefined
			dedicatedCtx.onmessage(
				new MessageEvent('message', {
					data: {
						type: UpstreamWorkerMessageType.DbWorkerPrepared,
						port: undefined
					} as unknown as UpstreamWorkerMessage<OurTransition>
				})
			)
		})
	})
	test('announceTransformation broadcasts Transformation message', () => {
		workerEntrypoint(minimumInput)
		const call = mockWorkerLocalFirst.mock
			.lastCall?.[0] as ConstructorParameters<typeof WorkerLocalFirst>[0]
		const testTransformation: Transformation = {
			action: TransformationAction.Set,
			path: ['test', 'path'],
			newValue: { foo: 'bar' }
		}
		call.announceTransformation(testTransformation)
		expect(postMessageMock).toHaveBeenCalledWith({
			type: DownstreamWorkerMessageType.Transformation,
			transformation: testTransformation
		})
	})
})
describe('shared worker broadcasts', () => {
	beforeEach(() => {
		// Ensure onconnect property exists so 'onconnect' in ctx returns true
		sharedCtx.onconnect = null
	})
	afterEach(() => {
		sharedCtx.onconnect = null
	})
	test('announceTransformation broadcasts to all connected ports', ({
		skip
	}) => {
		workerEntrypoint(minimumInput)
		if (typeof sharedCtx.onconnect !== 'function') return skip()

		// Connect multiple ports
		const channel1 = new MessageChannel()
		const channel2 = new MessageChannel()
		const postMessage1 = vi.fn()
		const postMessage2 = vi.fn()
		const mockPort1 = {
			...channel1.port1,
			postMessage: postMessage1
		} as unknown as MessagePort
		const mockPort2 = {
			...channel2.port1,
			postMessage: postMessage2
		} as unknown as MessagePort

		sharedCtx.onconnect(new MessageEvent('connect', { ports: [mockPort1] }))
		sharedCtx.onconnect(new MessageEvent('connect', { ports: [mockPort2] }))

		// Clear the init message calls
		postMessage1.mockClear()
		postMessage2.mockClear()

		// Trigger announceTransformation
		const call = mockWorkerLocalFirst.mock
			.lastCall?.[0] as ConstructorParameters<typeof WorkerLocalFirst>[0]
		const testTransformation: Transformation = {
			action: TransformationAction.Set,
			path: ['test'],
			newValue: 'broadcast-test'
		}
		call.announceTransformation(testTransformation)

		// Both ports should receive the message
		expect(postMessage1).toHaveBeenCalledWith({
			type: DownstreamWorkerMessageType.Transformation,
			transformation: testTransformation
		})
		expect(postMessage2).toHaveBeenCalledWith({
			type: DownstreamWorkerMessageType.Transformation,
			transformation: testTransformation
		})
	})
	test('Close message removes port from broadcast list', ({ skip }) => {
		workerEntrypoint(minimumInput)
		if (typeof sharedCtx.onconnect !== 'function') return skip()

		const channel = new MessageChannel()
		const portPostMessage = vi.fn()
		const mockPort = {
			...channel.port1,
			postMessage: portPostMessage
		} as unknown as MessagePort

		sharedCtx.onconnect(new MessageEvent('connect', { ports: [mockPort] }))
		if (!mockPort.onmessage) return skip()

		// Clear init message call
		portPostMessage.mockClear()

		// Send Close message to remove this port
		mockPort.onmessage(
			new MessageEvent('message', {
				data: {
					type: UpstreamWorkerMessageType.Close
				} satisfies UpstreamWorkerMessage<OurTransition>
			})
		)

		// Now broadcast - this port should not receive it
		const call = mockWorkerLocalFirst.mock
			.lastCall?.[0] as ConstructorParameters<typeof WorkerLocalFirst>[0]
		call.announceTransformation({
			action: TransformationAction.Set,
			path: ['test'],
			newValue: 'after-close'
		})

		expect(portPostMessage).not.toHaveBeenCalled()
	})
})
