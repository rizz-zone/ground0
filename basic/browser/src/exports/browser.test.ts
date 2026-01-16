import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	type UpstreamWorkerMessage,
	UpstreamWorkerMessageType
} from '@/types/internal_messages/UpstreamWorkerMessage'
import {
	type DownstreamWorkerMessage,
	DownstreamWorkerMessageType
} from '@/types/internal_messages/DownstreamWorkerMessage'
import { TransformationAction } from '@/types/memory_model/TransformationAction'
import { TransitionImpact } from '@ground0/shared'
import type { TestingTransition } from '@ground0/shared/testing'

type OriginalBrandedLog = (typeof import('@/common/branded_log'))['brandedLog']
let brandedLogImpl: OriginalBrandedLog
const brandedLog = vi
	.fn()
	.mockImplementation((...params: Parameters<OriginalBrandedLog>) =>
		brandedLogImpl(...params)
	)
vi.doMock('@/common/branded_log', () => ({ brandedLog }))

beforeEach(() => {
	vi.clearAllMocks()
	brandedLogImpl = () => {}
})

const BrowserLocalFirst = (await import('./browser')).BrowserLocalFirst

describe('Worker', () => {
	let mockWorker: Worker
	let mockOnMessage: ReturnType<typeof vi.fn>
	let inputs: ConstructorParameters<typeof BrowserLocalFirst>[0] & {
		worker: Worker
	}

	beforeEach(() => {
		mockWorker = {
			postMessage: vi.fn(),
			onmessage: null,
			onmessageerror: null,
			onerror: null
		} as unknown as Worker
		mockOnMessage = vi.fn()
		inputs = {
			worker: mockWorker,
			onMessage: mockOnMessage,
			pullWasmBinary: async () => new ArrayBuffer()
		}
	})

	describe('message posting via .postMessage()', () => {
		it('does not send any message on construction', () => {
			new BrowserLocalFirst(inputs)
			expect(mockWorker.postMessage).not.toHaveBeenCalled()
		})
		it('`sends transitions`', () => {
			const syncEngine = new BrowserLocalFirst<TestingTransition, object>(
				inputs
			)
			syncEngine.transition({
				action: 'shift_foo_bar',
				impact: TransitionImpact.LocalOnly
			})

			expect(mockWorker.postMessage).toHaveBeenLastCalledWith(
				{
					type: UpstreamWorkerMessageType.Transition,
					data: {
						action: 'shift_foo_bar',
						impact: TransitionImpact.LocalOnly
					}
				} satisfies UpstreamWorkerMessage<TestingTransition>,
				undefined
			)
		})
		it('sends Close on dispose', () => {
			const syncEngine = new BrowserLocalFirst<TestingTransition, object>(
				inputs
			)
			syncEngine[Symbol.dispose]()
			expect(mockWorker.postMessage).toHaveBeenLastCalledWith(
				{
					type: UpstreamWorkerMessageType.Close
				} satisfies UpstreamWorkerMessage<TestingTransition>,
				undefined
			)
		})
	})

	describe('downstream message handling', () => {
		it('handles InitMemoryModel messages', () => {
			new BrowserLocalFirst<TestingTransition, { count: number }>(inputs)

			const initMessage: DownstreamWorkerMessage<{ count: number }> = {
				type: DownstreamWorkerMessageType.InitMemoryModel,
				memoryModel: { count: 42 }
			}

			// Simulate receiving the message
			mockWorker.onmessage?.({ data: initMessage } as MessageEvent)

			expect(mockOnMessage).toHaveBeenCalledWith(initMessage)
		})

		it('handles Transformation messages', () => {
			new BrowserLocalFirst<TestingTransition, { count: number }>(inputs)

			const transformationMessage: DownstreamWorkerMessage<{ count: number }> =
				{
					type: DownstreamWorkerMessageType.Transformation,
					transformation: {
						action: TransformationAction.Set,
						path: ['count'],
						newValue: 100
					}
				}

			// Simulate receiving the message
			mockWorker.onmessage?.({ data: transformationMessage } as MessageEvent)

			expect(mockOnMessage).toHaveBeenCalledWith(transformationMessage)
		})

		it('respects downstreamGateOpen - blocks messages when closed', () => {
			const syncEngine = new BrowserLocalFirst<
				TestingTransition,
				{ count: number }
			>(inputs)

			// Close the gate
			syncEngine[Symbol.dispose]()

			const initMessage: DownstreamWorkerMessage<{ count: number }> = {
				type: DownstreamWorkerMessageType.InitMemoryModel,
				memoryModel: { count: 42 }
			}

			// Simulate receiving the message after gate is closed
			mockWorker.onmessage?.({ data: initMessage } as MessageEvent)

			expect(mockOnMessage).not.toHaveBeenCalled()
		})

		it('allows messages when downstreamGateOpen is true', () => {
			new BrowserLocalFirst<TestingTransition, { count: number }>(inputs)

			const initMessage: DownstreamWorkerMessage<{ count: number }> = {
				type: DownstreamWorkerMessageType.InitMemoryModel,
				memoryModel: { count: 42 }
			}

			// Simulate receiving the message
			mockWorker.onmessage?.({ data: initMessage } as MessageEvent)

			expect(mockOnMessage).toHaveBeenCalledWith(initMessage)
		})
	})

	describe('error handling', () => {
		it('handles message errors', () => {
			new BrowserLocalFirst<TestingTransition, object>(inputs)

			// Simulate message error
			mockWorker.onmessageerror?.(new MessageEvent('messageerror'))

			expect(brandedLog).toHaveBeenCalled()
		})

		it('handles worker errors', () => {
			new BrowserLocalFirst<TestingTransition, object>(inputs)

			// Simulate worker error
			mockWorker.onerror?.(new ErrorEvent('error'))

			expect(brandedLog).toHaveBeenCalled()
		})
	})
})
describe('SharedWorker', () => {
	type TestingSharedWorker = SharedWorker & {
		postMessage: Worker['postMessage']
	}
	let mockWorker: TestingSharedWorker
	let mockDbWorker: Worker
	let mockOnMessage: ReturnType<typeof vi.fn>
	let baseInputs: ConstructorParameters<typeof BrowserLocalFirst>[0] & {
		worker: SharedWorker
	}
	const wasmBinary = new ArrayBuffer()

	beforeEach(() => {
		mockWorker = {
			port: {
				postMessage: vi.fn(),
				onmessage: null,
				onmessageerror: null
			},
			postMessage: vi.fn(),
			onerror: null
		} as unknown as TestingSharedWorker
		mockDbWorker = {
			postMessage: vi.fn(),
			onmessage: null,
			onmessageerror: null,
			onerror: null,
			terminate: vi.fn()
		} as unknown as Worker
		mockOnMessage = vi.fn()
		baseInputs = {
			worker: mockWorker,
			onMessage: mockOnMessage,
			pullWasmBinary: async () => wasmBinary,
			dbWorker: mockDbWorker
		}
	})

	describe('message posting via .port.postMessage()', () => {
		it('does not send any message on construction', () => {
			new BrowserLocalFirst(baseInputs)
			expect(mockWorker.port.postMessage).not.toHaveBeenCalled()
			expect(mockWorker.postMessage).not.toHaveBeenCalled()
		})
		it('sends transitions', () => {
			const syncEngine = new BrowserLocalFirst<TestingTransition, object>(
				baseInputs
			)
			syncEngine.transition({
				action: 'shift_foo_bar',
				impact: TransitionImpact.LocalOnly
			})

			expect(mockWorker.port.postMessage).toHaveBeenLastCalledWith(
				{
					type: UpstreamWorkerMessageType.Transition,
					data: {
						action: 'shift_foo_bar',
						impact: TransitionImpact.LocalOnly
					}
				} satisfies UpstreamWorkerMessage<TestingTransition>,
				undefined
			)
			expect(mockWorker.postMessage).not.toBeCalled()
		})
		it('sends Close on dispose', () => {
			const syncEngine = new BrowserLocalFirst<TestingTransition, object>(
				baseInputs
			)
			syncEngine[Symbol.dispose]()
			expect(mockWorker.port.postMessage).toHaveBeenLastCalledWith(
				{
					type: UpstreamWorkerMessageType.Close
				} satisfies UpstreamWorkerMessage<TestingTransition>,
				undefined
			)
			expect(mockWorker.postMessage).not.toBeCalled()
		})
	})

	describe('downstream message handling', () => {
		it('handles InitMemoryModel messages via port', () => {
			new BrowserLocalFirst<TestingTransition, { count: number }>(baseInputs)

			const initMessage: DownstreamWorkerMessage<{ count: number }> = {
				type: DownstreamWorkerMessageType.InitMemoryModel,
				memoryModel: { count: 42 }
			}

			// Simulate receiving the message via port
			mockWorker.port.onmessage?.({ data: initMessage } as MessageEvent)

			expect(mockOnMessage).toHaveBeenCalledWith(initMessage)
		})

		it('handles Transformation messages via port', () => {
			new BrowserLocalFirst<TestingTransition, { count: number }>(baseInputs)

			const transformationMessage: DownstreamWorkerMessage<{ count: number }> =
				{
					type: DownstreamWorkerMessageType.Transformation,
					transformation: {
						action: TransformationAction.Delete,
						path: ['count']
					}
				}

			// Simulate receiving the message via port
			mockWorker.port.onmessage?.({
				data: transformationMessage
			} as MessageEvent)

			expect(mockOnMessage).toHaveBeenCalledWith(transformationMessage)
		})

		it('respects downstreamGateOpen - blocks messages when closed', () => {
			const syncEngine = new BrowserLocalFirst<
				TestingTransition,
				{ count: number }
			>(baseInputs)

			// Close the gate
			syncEngine[Symbol.dispose]()

			const initMessage: DownstreamWorkerMessage<{ count: number }> = {
				type: DownstreamWorkerMessageType.InitMemoryModel,
				memoryModel: { count: 42 }
			}

			// Simulate receiving the message after gate is closed
			mockWorker.port.onmessage?.({ data: initMessage } as MessageEvent)

			expect(mockOnMessage).not.toHaveBeenCalled()
		})
	})

	describe('error handling', () => {
		it('handles port message errors', () => {
			new BrowserLocalFirst<TestingTransition, object>(baseInputs)

			// Simulate port message error
			mockWorker.port.onmessageerror?.(new MessageEvent('messageerror'))

			expect(brandedLog).toHaveBeenCalled()
		})

		it('handles shared worker errors', () => {
			new BrowserLocalFirst<TestingTransition, object>(baseInputs)

			// Simulate shared worker error
			mockWorker.onerror?.(new ErrorEvent('error'))

			expect(brandedLog).toHaveBeenCalled()
		})

		describe('WASM binary handling', () => {
			it('handles synchronous errors from pullWasmBinary', () => {
				const syncError = new Error('sync error')
				let pullWasmBinaryCallCount = 0
				baseInputs.pullWasmBinary = () => {
					pullWasmBinaryCallCount++
					throw syncError
				}

				new BrowserLocalFirst<TestingTransition, object>(baseInputs)

				// Verify the function was called and error was logged
				expect(pullWasmBinaryCallCount).toBe(1)
				expect(brandedLog).toHaveBeenCalledWith(
					console.error,
					'Obtaining WASM binary failed (synchronously):',
					syncError
				)
				expect(mockDbWorker.terminate).toHaveBeenCalled()
			})

			it('sets up dbWorker.onmessage handler', () => {
				new BrowserLocalFirst<TestingTransition, object>(baseInputs)

				// Verify the onmessage handler is set
				expect(mockDbWorker.onmessage).toBeDefined()

				// Simulate the db worker responding with a port
				const mockPort = { postMessage: vi.fn() } as unknown as MessagePort

				mockDbWorker.onmessage?.({
					data: { port: mockPort }
				} as MessageEvent)

				// Verify submitWorkerMessage was called with the port
				expect(mockWorker.port.postMessage).toHaveBeenCalledWith(
					{
						type: UpstreamWorkerMessageType.DbWorkerPrepared,
						port: mockPort
					} satisfies UpstreamWorkerMessage<TestingTransition>,
					[mockPort]
				)
			})
		})
	})
})
