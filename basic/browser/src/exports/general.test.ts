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

const postMessage = vi.fn()
dedicatedCtx.postMessage = postMessage

afterEach(vi.clearAllMocks)

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
	beforeEach(() => {
		sharedCtx.onconnect = null
	})
	afterAll(() => {
		// @ts-expect-error We can't just set it to undefined because it will
		// still exist in that case.
		delete sharedCtx.onconnect
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
	describe('announces transformations', () => {
		test('to one port', ({ skip }) => {
			workerEntrypoint(minimumInput)
			if (!sharedCtx.onconnect) return skip()

			const channel = new MessageChannel()
			const postMessage = vi.fn()
			const port = {
				...channel.port1,
				postMessage
			}
			sharedCtx.onconnect(new MessageEvent('connect', { ports: [port] }))

			const call = mockWorkerLocalFirst.mock
				.lastCall?.[0] as ConstructorParameters<typeof WorkerLocalFirst>[0]
			if (!call) return skip()

			{
				const transformation: Transformation = {
					action: TransformationAction.Set,
					path: randomPath(),
					newValue: crypto.randomUUID()
				}
				call.announceTransformation(transformation)
				expect(postMessage).toHaveBeenLastCalledWith({
					type: DownstreamWorkerMessageType.Transformation,
					transformation
				} satisfies DownstreamWorkerMessage<object>)
			}
			{
				const transformation: Transformation = {
					action: TransformationAction.Delete,
					path: randomPath()
				}
				call.announceTransformation(transformation)
				expect(postMessage).toHaveBeenLastCalledWith({
					type: DownstreamWorkerMessageType.Transformation,
					transformation
				} satisfies DownstreamWorkerMessage<object>)
			}
		})
		test('to all ports, when many are connected', ({ skip }) => {
			workerEntrypoint(minimumInput)
			if (!sharedCtx.onconnect) return skip()
			const call = mockWorkerLocalFirst.mock
				.lastCall?.[0] as ConstructorParameters<typeof WorkerLocalFirst>[0]
			if (!call) return skip()

			const postMessages: Mock[] = []
			for (let i = 0; i <= 100; i++) {
				{
					const transformation: Transformation = {
						action: TransformationAction.Set,
						path: randomPath(),
						newValue: crypto.randomUUID()
					}
					call.announceTransformation(transformation)
					for (const postMessage of postMessages) {
						expect(postMessage).toHaveBeenLastCalledWith({
							type: DownstreamWorkerMessageType.Transformation,
							transformation
						} satisfies DownstreamWorkerMessage<object>)
					}
				}
				{
					const transformation: Transformation = {
						action: TransformationAction.Delete,
						path: randomPath()
					}
					call.announceTransformation(transformation)
					for (const postMessage of postMessages) {
						expect(postMessage).toHaveBeenLastCalledWith({
							type: DownstreamWorkerMessageType.Transformation,
							transformation
						} satisfies DownstreamWorkerMessage<object>)
					}
				}

				const channel = new MessageChannel()
				const postMessage = vi.fn()
				const port = {
					...channel.port1,
					postMessage
				}
				sharedCtx.onconnect(new MessageEvent('connect', { ports: [port] }))
			}
		})
	})
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
	test('announces transformations', ({ skip }) => {
		workerEntrypoint(minimumInput)
		const call = mockWorkerLocalFirst.mock
			.lastCall?.[0] as ConstructorParameters<typeof WorkerLocalFirst>[0]
		if (!call) return skip()

		const transformation: Transformation = {
			action: TransformationAction.Set,
			path: randomPath(),
			newValue: crypto.randomUUID()
		}
		call.announceTransformation(transformation)
		expect(postMessage).toHaveBeenLastCalledWith({
			type: DownstreamWorkerMessageType.Transformation,
			transformation
		} satisfies DownstreamWorkerMessage<object>)
	})
})
describe('message handling', ({ skip: skipSuite }) => {
	beforeAll(() => {
		const skip = () =>
			skipSuite(
				"There is an issue with the SharedWorker implementation, so message handling can't be tested without unrelated issues showing up."
			)
		const consoleDebug = vi
			.spyOn(console, 'debug')
			.mockImplementationOnce(() => {})
		sharedCtx.onconnect = null
		workerEntrypoint(minimumInput)

		if (!sharedCtx.onconnect) return skip()
		if (!mockWorkerLocalFirst.mock.lastCall?.[0]) return skip()

		const channel = new MessageChannel()
		;(
			sharedCtx.onconnect as (
				this: SharedWorkerGlobalScope,
				ev: MessageEvent
			) => unknown
		)(new MessageEvent('connect', { ports: [channel.port1] }))
		if (!channel.port1.onmessage) return skip()

		const uuid = crypto.randomUUID()
		channel.port1.onmessage(
			new MessageEvent<UpstreamWorkerMessage<Transition>>('message', {
				data: { type: UpstreamWorkerMessageType.DebugLog, message: uuid }
			})
		)

		if (
			!consoleDebug.mock.lastCall ||
			!consoleDebug.mock.lastCall.includes(uuid)
		)
			return skip()
	})
	beforeEach(() => {
		workerEntrypoint(minimumInput)
	})
	afterAll(() => {
		// @ts-expect-error We can't just set it to undefined because it will
		// still exist in that case.
		delete sharedCtx.onconnect
	})
	test('close', ({ skip }) => {
		if (!sharedCtx.onconnect) return skip()
		const call = mockWorkerLocalFirst.mock
			.lastCall?.[0] as ConstructorParameters<typeof WorkerLocalFirst>[0]
		if (!call) return skip()

		// We have no way of actually looking inside of the closure and seeing
		// that the port has been removed, but a side-effect of a port being
		// removed is that messages won't be broadcast to it as there's no
		// reference to it anymore, so this is what we look at instead. If the
		// port we 'close' doesn't receive any transformations anymore, that
		// means it has successfully been removed.

		const channel = new MessageChannel()
		const postMessage1 = vi.fn()
		const port1 = {
			...channel.port1,
			postMessage: postMessage1
		}
		const postMessage2 = vi.fn()
		const port2 = {
			...channel.port1,
			postMessage: postMessage2
		}
		sharedCtx.onconnect(new MessageEvent('connect', { ports: [port1] }))
		sharedCtx.onconnect(new MessageEvent('connect', { ports: [port2] }))

		const transformation: Transformation = {
			action: TransformationAction.Set,
			path: randomPath(),
			newValue: crypto.randomUUID()
		}
		call.announceTransformation(transformation)

		expect(postMessage1).toHaveBeenCalledTimes(2)
		expect(postMessage2).toHaveBeenCalledTimes(2)

		if (!port1.onmessage) return skip()
		port1.onmessage(
			new MessageEvent<UpstreamWorkerMessage<Transition>>('message', {
				data: { type: UpstreamWorkerMessageType.Close }
			})
		)

		call.announceTransformation(transformation)

		expect(postMessage1).toHaveBeenCalledTimes(2)
		expect(postMessage2).toHaveBeenCalledTimes(3)
	})
	test('transition', ({ skip }) => {
		if (!sharedCtx.onconnect) return skip()
		const call = mockWorkerLocalFirst.mock
			.lastCall?.[0] as ConstructorParameters<typeof WorkerLocalFirst>[0]
		if (!call) return skip()

		const { port1: port } = new MessageChannel()
		sharedCtx.onconnect(new MessageEvent('connect', { ports: [port] }))
		if (!port.onmessage) return skip()

		const transition: Transition = {
			action: 'abc',
			impact: TransitionImpact.LocalOnly,
			data: {
				foo: 'bar',
				day: new Date(),
				iLoveMyNumberHashtagMyNumber: 4
			}
		}
		port.onmessage(
			new MessageEvent<UpstreamWorkerMessage<Transition>>('message', {
				data: { type: UpstreamWorkerMessageType.Transition, data: transition }
			})
		)

		expect(transitionFn).toHaveBeenCalledExactlyOnceWith(transition)
	})
	test('DbWorkerPrepared', ({ skip }) => {
		if (!sharedCtx.onconnect) return skip()

		const { port1: port } = new MessageChannel()
		sharedCtx.onconnect(new MessageEvent('connect', { ports: [port] }))
		if (!port.onmessage) return skip()

		// Create a mock port that we can identify
		const mockDbWorkerPort = {} as MessagePort
		port.onmessage(
			new MessageEvent<UpstreamWorkerMessage<Transition>>('message', {
				data: {
					type: UpstreamWorkerMessageType.DbWorkerPrepared,
					port: mockDbWorkerPort
				}
			})
		)

		expect(newPortFn).toHaveBeenCalledExactlyOnceWith(mockDbWorkerPort)
	})
})
