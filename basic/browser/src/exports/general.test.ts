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
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
	type Mock
} from 'vitest'
import {
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
	sharedCtx.onconnect = null
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

// For announcement testing
function randomPath() {
	return Array.from(
		{ length: Math.max(Math.floor(Math.random() * 10), 1) },
		() => crypto.randomUUID()
	)
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
			} as any
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
	test('on init, onmessage and onmessageerror are set and message is posted', () => {
		workerEntrypoint(minimumInput)
		expect(postMessageMock).toHaveBeenCalledWith({
			type: DownstreamWorkerMessageType.InitMemoryModel,
			memoryModel: minimumInput.initialMemoryModel
		} satisfies DownstreamWorkerMessage<object>)
	})
})
