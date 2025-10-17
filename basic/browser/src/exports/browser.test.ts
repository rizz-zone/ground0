import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserLocalFirst } from './browser'
import {
	type UpstreamWorkerMessage,
	UpstreamWorkerMessageType
} from '@/types/internal_messages/UpstreamWorkerMessage'
import { type TestingTransition, TransitionImpact } from '@ground0/shared'

describe('Worker', () => {
	describe('message posting via .postMessage()', () => {
		let mockWorker: Worker
		beforeEach(() => {
			mockWorker = {
				postMessage: vi.fn()
			} as unknown as Worker
		})

		it('does not send any message on construction', () => {
			new BrowserLocalFirst(mockWorker)
			expect(mockWorker.postMessage).not.toHaveBeenCalled()
		})
		it('sends transitions', () => {
			const syncEngine = new BrowserLocalFirst<TestingTransition>(mockWorker)
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
			const syncEngine = new BrowserLocalFirst<TestingTransition>(mockWorker)
			syncEngine[Symbol.dispose]()
			expect(mockWorker.postMessage).toHaveBeenLastCalledWith({
				type: UpstreamWorkerMessageType.Close
			} satisfies UpstreamWorkerMessage<TestingTransition>)
		})
	})
})
describe('SharedWorker', () => {
	type TestingSharedWorker = SharedWorker & {
		postMessage: Worker['postMessage']
	}
	let mockWorker: TestingSharedWorker
	beforeEach(() => {
		mockWorker = {
			port: { postMessage: vi.fn() },
			postMessage: vi.fn()
		} as unknown as TestingSharedWorker
	})

	describe('message posting via .port.postMessage()', () => {
		it('does not send any message on construction', () => {
			new BrowserLocalFirst(mockWorker)
			expect(mockWorker.port.postMessage).not.toHaveBeenCalled()
			expect(mockWorker.postMessage).not.toHaveBeenCalled()
		})
		it('sends transitions', () => {
			const syncEngine = new BrowserLocalFirst<TestingTransition>(mockWorker)
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
			const syncEngine = new BrowserLocalFirst<TestingTransition>(mockWorker)
			syncEngine[Symbol.dispose]()
			expect(mockWorker.port.postMessage).toHaveBeenLastCalledWith({
				type: UpstreamWorkerMessageType.Close
			} satisfies UpstreamWorkerMessage<TestingTransition>)
			expect(mockWorker.postMessage).not.toBeCalled()
		})
	})
})
