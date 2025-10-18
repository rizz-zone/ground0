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
import { type TestingTransition, TransitionImpact } from '@ground0/shared'

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
	describe('message posting via .postMessage()', () => {
		let mockWorker: Worker
		let mockOnMessage: ReturnType<typeof vi.fn>

		beforeEach(() => {
			mockWorker = {
				postMessage: vi.fn(),
				onmessage: null,
				onmessageerror: null,
				onerror: null
			} as unknown as Worker
			mockOnMessage = vi.fn()
		})

		it('does not send any message on construction', () => {
			new BrowserLocalFirst(mockWorker, mockOnMessage)
			expect(mockWorker.postMessage).not.toHaveBeenCalled()
		})
		it('sends transitions', () => {
			const syncEngine = new BrowserLocalFirst<TestingTransition, object>(
				mockWorker,
				mockOnMessage
			)
			syncEngine.transition({
				action: 'shift_foo_bar',
				impact: TransitionImpact.LocalOnly
			})

			expect(mockWorker.postMessage).toHaveBeenLastCalledWith({
				type: UpstreamWorkerMessageType.Transition,
				data: {
					action: 'shift_foo_bar',
					impact: TransitionImpact.LocalOnly
				}
			} satisfies UpstreamWorkerMessage<TestingTransition>)
		})
		it('sends Close on dispose', () => {
			const syncEngine = new BrowserLocalFirst<TestingTransition, object>(
				mockWorker,
				mockOnMessage
			)
			syncEngine[Symbol.dispose]()
			expect(mockWorker.postMessage).toHaveBeenLastCalledWith({
				type: UpstreamWorkerMessageType.Close
			} satisfies UpstreamWorkerMessage<TestingTransition>)
		})
	})

	describe('downstream message handling', () => {
		let mockWorker: Worker
		let mockOnMessage: ReturnType<typeof vi.fn>

		beforeEach(() => {
			mockWorker = {
				postMessage: vi.fn(),
				onmessage: null,
				onmessageerror: null,
				onerror: null
			} as unknown as Worker
			mockOnMessage = vi.fn()
		})

		it('handles InitMemoryModel messages', () => {
			new BrowserLocalFirst<TestingTransition, { count: number }>(
				mockWorker,
				mockOnMessage
			)

			const initMessage: DownstreamWorkerMessage<{ count: number }> = {
				type: DownstreamWorkerMessageType.InitMemoryModel,
				memoryModel: { count: 42 }
			}

			// Simulate receiving the message
			mockWorker.onmessage?.({ data: initMessage } as MessageEvent)

			expect(mockOnMessage).toHaveBeenCalledWith(initMessage)
		})

		it('handles Transformation messages', () => {
			new BrowserLocalFirst<TestingTransition, { count: number }>(
				mockWorker,
				mockOnMessage
			)

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
			>(mockWorker, mockOnMessage)

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
			new BrowserLocalFirst<TestingTransition, { count: number }>(
				mockWorker,
				mockOnMessage
			)

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
		let mockWorker: Worker
		let mockOnMessage: ReturnType<typeof vi.fn>

		beforeEach(() => {
			mockWorker = {
				postMessage: vi.fn(),
				onmessage: null,
				onmessageerror: null,
				onerror: null
			} as unknown as Worker
			mockOnMessage = vi.fn()
		})

		it('handles message errors', () => {
			new BrowserLocalFirst<TestingTransition, object>(
				mockWorker,
				mockOnMessage
			)

			// Simulate message error
			mockWorker.onmessageerror?.(new MessageEvent('messageerror'))

			expect(brandedLog).toHaveBeenCalled()
		})

		it('handles worker errors', () => {
			new BrowserLocalFirst<TestingTransition, object>(
				mockWorker,
				mockOnMessage
			)

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
	let mockOnMessage: ReturnType<typeof vi.fn>

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
		mockOnMessage = vi.fn()
	})

	describe('message posting via .port.postMessage()', () => {
		it('does not send any message on construction', () => {
			new BrowserLocalFirst(mockWorker, mockOnMessage)
			expect(mockWorker.port.postMessage).not.toHaveBeenCalled()
			expect(mockWorker.postMessage).not.toHaveBeenCalled()
		})
		it('sends transitions', () => {
			const syncEngine = new BrowserLocalFirst<TestingTransition, object>(
				mockWorker,
				mockOnMessage
			)
			syncEngine.transition({
				action: 'shift_foo_bar',
				impact: TransitionImpact.LocalOnly
			})

			expect(mockWorker.port.postMessage).toHaveBeenLastCalledWith({
				type: UpstreamWorkerMessageType.Transition,
				data: {
					action: 'shift_foo_bar',
					impact: TransitionImpact.LocalOnly
				}
			} satisfies UpstreamWorkerMessage<TestingTransition>)
			expect(mockWorker.postMessage).not.toBeCalled()
		})
		it('sends Close on dispose', () => {
			const syncEngine = new BrowserLocalFirst<TestingTransition, object>(
				mockWorker,
				mockOnMessage
			)
			syncEngine[Symbol.dispose]()
			expect(mockWorker.port.postMessage).toHaveBeenLastCalledWith({
				type: UpstreamWorkerMessageType.Close
			} satisfies UpstreamWorkerMessage<TestingTransition>)
			expect(mockWorker.postMessage).not.toBeCalled()
		})
	})

	describe('downstream message handling', () => {
		it('handles InitMemoryModel messages via port', () => {
			new BrowserLocalFirst<TestingTransition, { count: number }>(
				mockWorker,
				mockOnMessage
			)

			const initMessage: DownstreamWorkerMessage<{ count: number }> = {
				type: DownstreamWorkerMessageType.InitMemoryModel,
				memoryModel: { count: 42 }
			}

			// Simulate receiving the message via port
			mockWorker.port.onmessage?.({ data: initMessage } as MessageEvent)

			expect(mockOnMessage).toHaveBeenCalledWith(initMessage)
		})

		it('handles Transformation messages via port', () => {
			new BrowserLocalFirst<TestingTransition, { count: number }>(
				mockWorker,
				mockOnMessage
			)

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
			>(mockWorker, mockOnMessage)

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
			new BrowserLocalFirst<TestingTransition, object>(
				mockWorker,
				mockOnMessage
			)

			// Simulate port message error
			mockWorker.port.onmessageerror?.(new MessageEvent('messageerror'))

			expect(brandedLog).toHaveBeenCalled()
		})

		it('handles shared worker errors', () => {
			new BrowserLocalFirst<TestingTransition, object>(
				mockWorker,
				mockOnMessage
			)

			// Simulate shared worker error
			mockWorker.onerror?.(new ErrorEvent('error'))

			expect(brandedLog).toHaveBeenCalled()
		})
	})
})
