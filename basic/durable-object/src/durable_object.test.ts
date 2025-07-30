/// <reference types="@cloudflare/vitest-pool-workers" />
/// <reference types="./testing/worker-configuration.d.ts" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import { runInDurableObject } from 'cloudflare:test'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import type { SampleObject } from './testing/sample_object'

// If we don't do this, env.* won't have our SAMPLE_OBJECT binding.
declare module 'cloudflare:test' {
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface ProvidedEnv extends Env {}
}

vi.mock('drizzle-orm/durable-sqlite/migrator', { spy: true })
const migrateMock = vi.mocked(migrate).mockImplementation(async () => {})

afterEach(() => {
	migrateMock.mockClear()
})

describe('constructor', () => {
	let stub: DurableObjectStub<SampleObject>
	beforeEach(() => {
		const id = env.SAMPLE_OBJECT.newUniqueId()
		stub = env.SAMPLE_OBJECT.get(id)
	})
	it('assigns this.db', async () => {
		await runInDurableObject(stub, (instance) => {
			// @ts-expect-error We need to acces private members for testing.
			expect(instance.db).toBeDefined()
		})
	})
	it('Calls for a migration', async () => {
		await runInDurableObject(stub, (instance) => {
			expect(migrateMock).toHaveBeenCalledExactlyOnceWith(
				// @ts-expect-error We need to acces private members for testing.
				instance.db,
				// @ts-expect-error We need to acces private members for testing.
				instance.engineDef.db.migrations
			)
		})
	})
})
