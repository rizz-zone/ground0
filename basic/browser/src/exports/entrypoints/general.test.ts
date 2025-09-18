const mockWorkerLocalFirst = vi.fn().mockImplementation(() => ({
	memoryModel: {},
	transition: transitionFn
}))
vi.doMock('@/helpers/worker_thread', () => ({
	WorkerLocalFirst: mockWorkerLocalFirst
}))

import { afterEach, describe, expect, test, vi } from 'vitest'
import { workerEntrypoint } from './general'
import { object, literal, type z } from 'zod'
import { createTransitionSchema, TransitionImpact } from '@ground0/shared'
import type { LocalEngineDefinition } from '@/types/LocalEngineDefinition'
import { WorkerLocalFirst } from '@/helpers/worker_thread'

const _sharedCtx = self as unknown as SharedWorkerGlobalScope
const dedicatedCtx = self as DedicatedWorkerGlobalScope

const postMessage = vi.fn()
dedicatedCtx.postMessage = postMessage

const transitionFn = vi.fn()

afterEach(vi.clearAllMocks)

const OurTransitionSchema = object({
	action: literal('abc'),
	impact: literal(TransitionImpact.LocalOnly)
})

const minimumInput: LocalEngineDefinition<
	Record<string, never>,
	z.infer<typeof OurTransitionSchema>
> = {
	engineDef: {
		transitions: {
			schema: createTransitionSchema(OurTransitionSchema),
			sharedHandlers: {}
		},
		version: {
			current: '1.2.3'
		},
		db: {
			migrations: {
				journal: {
					entries: [
						{
							idx: 0,
							when: 0,
							tag: 'something',
							breakpoints: true
						}
					]
				},
				migrations: { a: 'b' }
			}
		}
	},
	localHandlers: {
		abc: {
			editDb: () => {}
		}
	},
	initialMemoryModel: {},
	pullWasmBinary: async () => new ArrayBuffer(),
	wsUrl: 'wss://jerry.io/ws',
	dbName: 'dave'
}

describe('always', () => {
	test('creates a WorkerLocalFirst', () => {
		expect(WorkerLocalFirst).not.toHaveBeenCalled()
		workerEntrypoint(minimumInput)
		expect(WorkerLocalFirst).toHaveBeenCalledOnce()
		console.log(mockWorkerLocalFirst.mock.lastCall)
	})
})
