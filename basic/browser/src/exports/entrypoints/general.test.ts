// TODO: Put some tests in here

import { describe, test, vi } from 'vitest'
import { workerEntrypoint } from './general'

const sharedCtx = self as unknown as SharedWorkerGlobalScope
const dedicatedCtx = self as DedicatedWorkerGlobalScope

const WorkerLocalFirst = vi.fn()
const workerThreadHelperMock = vi.mock('../helpers/worker_thread', () => {
	return {
		WorkerLocalFirst
	}
})

const minimumInput: Parameters<typeof workerEntrypoint>[0] = {}

describe('always', () => {
	test('creates a WorkerLocalFirst', () => {
		workerEntrypoint()
	})
})
