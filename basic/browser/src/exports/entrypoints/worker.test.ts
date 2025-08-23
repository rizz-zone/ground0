import { vi, beforeEach, describe, expect, it } from 'vitest'
import { UpstreamWorkerMessageType } from '@/types/internal_messages/UpstreamWorkerMessage'
import { WorkerLocalFirst } from '@/helpers/worker_thread'
import { importUnique, WorkerDoubleInitError } from '@ground0/shared'

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope

const mockWorkerLocalFirstInstance = {
	init: vi.fn(),
	[Symbol.dispose]: vi.fn()
}

vi.mock('../../helpers/worker_thread', () => ({
	WorkerLocalFirst: vi.fn(() => mockWorkerLocalFirstInstance)
}))

describe('Worker entrypoint', () => {
	let workerEntrypoint: () => unknown
	beforeEach(async () => {
		vi.clearAllMocks()
		workerEntrypoint = (await importUnique('./worker')).workerEntrypoint
	})

	it('should set onmessage and onmessageerror handlers', () => {
		workerEntrypoint()
		expect(onmessage).toBeDefined()
		expect(onmessage).toBeTypeOf('function')
		expect(onmessageerror).toBeDefined()
		expect(onmessageerror).toBeTypeOf('function')
	})

	it('should create a new WorkerLocalFirst and initialize it on Init message', () => {
		workerEntrypoint()
		const message = {
			type: UpstreamWorkerMessageType.Init,
			data: { wsUrl: 'ws://localhost:8080', dbName: 'test-db' }
		}
		if (!workerScope.onmessage) throw new Error('onmessage is not defined')
		workerScope.onmessage(new MessageEvent('message', { data: message }))

		expect(WorkerLocalFirst).toHaveBeenCalledOnce()
		expect(mockWorkerLocalFirstInstance.init).toHaveBeenCalledWith({
			wsUrl: 'ws://localhost:8080',
			dbName: 'test-db'
		})
	})

	it('should log error on message error', () => {
		const consoleErrorSpy = vi
			.spyOn(console, 'error')
			.mockImplementation(() => {})
		workerEntrypoint()
		const errorEvent = new MessageEvent('messageerror', {
			data: 'test error'
		})
		if (!workerScope.onmessageerror)
			throw new Error('onmessageerror is not defined')
		workerScope.onmessageerror(errorEvent)

		expect(consoleErrorSpy).toHaveBeenCalled()
		consoleErrorSpy.mockRestore()
	})

	it('should disallow double init', () => {
		workerEntrypoint()
		expect(workerEntrypoint).toThrow(WorkerDoubleInitError)
	})
})
