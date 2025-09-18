const transitionFn = vi.fn()
const mockWorkerLocalFirst = vi.fn().mockImplementation(() => ({
	memoryModel: {},
	transition: transitionFn
}))
vi.doMock('@/helpers/worker_thread', () => ({
	WorkerLocalFirst: mockWorkerLocalFirst
}))

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { object, literal, type z } from 'zod'
import { createTransitionSchema, TransitionImpact } from '@ground0/shared'
import type { LocalEngineDefinition } from '@/types/LocalEngineDefinition'
import type { WorkerLocalFirst } from '@/helpers/worker_thread'
const { workerEntrypoint } = await import('./general')

const _sharedCtx = self as unknown as SharedWorkerGlobalScope
const dedicatedCtx = self as DedicatedWorkerGlobalScope

const postMessage = vi.fn()
dedicatedCtx.postMessage = postMessage

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
		expect(call.localHandlers).toBe(minimumInput.localHandlers)
		expect(call.announceTransformation).toBeTypeOf('function')
		expect(call.pullWasmBinary).toBe(minimumInput.pullWasmBinary)
	})
})
describe('dedicated worker', () => {
	beforeEach(() => {
		// @ts-expect-error We're just tacking onconnect on
		dedicatedCtx.onconnect = undefined
	})
	afterEach(() => {
		// @ts-expect-error We're just tacking onconnect on
		dedicatedCtx.onconnect = undefined
	})
	test('sets onconnect', () => {
		// @ts-expect-error We're just tacking onconnect on
		dedicatedCtx.onconnect = 'a'
		// @ts-expect-error We're just tacking onconnect on
		expect(dedicatedCtx.onconnect).not.toBeTypeOf('function')
		workerEntrypoint(minimumInput)
		// @ts-expect-error We're just tacking onconnect on
		expect(dedicatedCtx.onconnect).toBeTypeOf('function')
	})
})
