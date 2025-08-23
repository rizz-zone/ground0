import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserLocalFirst } from './browser'
import { DB_NAME, SOCKET_URL } from '@/testing/constants'
import {
	type UpstreamWorkerMessage,
	UpstreamWorkerMessageType
} from '@/types/internal_messages/UpstreamWorkerMessage'
import { type TestingTransition, TransitionImpact } from '@ground0/shared'

const setIntervalMock = vi
	.spyOn(globalThis, 'setInterval')
	.mockImplementation(() => 1 as unknown as NodeJS.Timeout)

describe('BrowserLocalFirst', () => {
	beforeEach(() => setIntervalMock.mockClear())
	describe('Worker', () => {
		describe('message posting via .postMessage()', () => {
			let mockWorker: Worker
			beforeEach(() => {
				mockWorker = {
					postMessage: vi.fn()
				} as unknown as Worker
			})

			it('inits', () => {
				new BrowserLocalFirst({
					dbName: DB_NAME,
					wsUrl: SOCKET_URL,
					worker: mockWorker
				})

				expect(mockWorker.postMessage).toHaveBeenCalledExactlyOnceWith({
					type: UpstreamWorkerMessageType.Init,
					data: {
						dbName: DB_NAME,
						wsUrl: SOCKET_URL
					}
				} satisfies UpstreamWorkerMessage<TestingTransition>)
			})
			it('sends transitions', () => {
				const syncEngine = new BrowserLocalFirst<TestingTransition>({
					dbName: DB_NAME,
					wsUrl: SOCKET_URL,
					worker: mockWorker
				})
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
				})
			})
			it('does not set a timer', () => {
				new BrowserLocalFirst<TestingTransition>({
					dbName: DB_NAME,
					wsUrl: SOCKET_URL,
					worker: mockWorker
				})
				expect(setIntervalMock).not.toHaveBeenCalled()
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

		it('sets a timer', () => {
			new BrowserLocalFirst<TestingTransition>({
				dbName: DB_NAME,
				wsUrl: SOCKET_URL,
				worker: mockWorker
			})
			expect(setIntervalMock).toHaveBeenCalledOnce()
		})
		describe('message posting via .port.postMessage()', () => {
			it('inits', () => {
				new BrowserLocalFirst({
					dbName: DB_NAME,
					wsUrl: SOCKET_URL,
					worker: mockWorker
				})

				expect(mockWorker.port.postMessage).toHaveBeenCalledExactlyOnceWith({
					type: UpstreamWorkerMessageType.Init,
					data: {
						dbName: DB_NAME,
						wsUrl: SOCKET_URL
					}
				} satisfies UpstreamWorkerMessage<TestingTransition>)
				expect(mockWorker.postMessage).not.toBeCalled()
			})
			it('sends transitions', () => {
				const syncEngine = new BrowserLocalFirst<TestingTransition>({
					dbName: DB_NAME,
					wsUrl: SOCKET_URL,
					worker: mockWorker
				})
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
				})
				expect(mockWorker.postMessage).not.toBeCalled()
			})
		})
	})
})
