// TODO: Put some tests in here

import { describe, test, vi } from 'vitest'
import { workerEntrypoint } from './general'
import { object, literal, type infer } from 'zod'
import { createTransitionSchema, TransitionImpact } from '@ground0/shared'
import type { GeneratedMigrationSchema } from '../../../../shared/dist/types/transitions/handling/GeneratedMigrationSchema'

const sharedCtx = self as unknown as SharedWorkerGlobalScope
const dedicatedCtx = self as DedicatedWorkerGlobalScope

const WorkerLocalFirst = vi.fn()
const workerThreadHelperMock = vi.mock('../helpers/worker_thread', () => {
	return {
		WorkerLocalFirst
	}
})

const OurTransitionSchema = object({
	action: literal('abc'),
	impact: literal(TransitionImpact.LocalOnly)
})

const minimumInput: Parameters<typeof workerEntrypoint<Record<unknown, never>, infer<typeof OurTransitionSchema>>[0] = {
	engineDef: {
		transitions: {
			schema: createTransitionSchema(OurTransitionSchema),
			sharedHandlers: {}
		},
		version: {
			current: '1.2.3'
		},
		db: {
			migrations: {} as GeneratedMigrationSchema
		}
	},
    localHandlers: {
		'abc': {

		}
	},
    initialMemoryModel: {},
    migrations: Migrations;
    pullWasmBinary: () => Promise<ArrayBuffer>;
    wsUrl: string;
    dbName: string;
}

describe('always', () => {
	test('creates a WorkerLocalFirst', () => {
		workerEntrypoint()
	})
})
