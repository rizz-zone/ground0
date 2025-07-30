/// <reference types="@cloudflare/vitest-pool-workers" />
/// <reference types="./testing/worker-configuration.d.ts" />

import { describe, expect, it } from 'vitest'
import { env } from 'cloudflare:test'
import { runInDurableObject } from 'cloudflare:test'

declare module 'cloudflare:test' {
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface ProvidedEnv extends Env {}
}

describe('constructor', () => {
	it('assigns this.db', async () => {
		const id = env.SAMPLE_OBJECT.idFromName('/path')
		const stub = env.SAMPLE_OBJECT.get(id)
		await runInDurableObject(stub, (instance) => {
			expect(true).toBe(true)
		})
	})
})
