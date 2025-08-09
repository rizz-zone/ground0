import { vi, beforeEach, describe, expect, it } from 'vitest'
import { sharedWorkerEntrypoint } from './shared_worker'
import { portManager } from '@/helpers/port_manager'
import { importUnique, WorkerDoubleInitError } from '@ground0/shared'

describe('SharedWorker entrypoint', () => {
	const initSpy = vi.spyOn(portManager, 'init')
	beforeEach(() => {
		initSpy.mockClear()
	})

	it('does not call portManager.init if not invoked', async () => {
		await importUnique('./shared_worker')
		expect(initSpy).not.toBeCalled()
	})
	it('calls portManager.init when invoked', () => {
		sharedWorkerEntrypoint()
		expect(initSpy).toHaveBeenCalledOnce()
	})
	it('can only be called once', async () => {
		const { sharedWorkerEntrypoint } = await importUnique('./shared_worker')
		expect(sharedWorkerEntrypoint).not.toThrow()
		expect(sharedWorkerEntrypoint).toThrow(WorkerDoubleInitError)
	})
})
