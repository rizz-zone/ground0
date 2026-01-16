import { describe, expect, it, vi } from 'vitest'
import { TransitionAction, UpdateAction } from '@ground0/sample-counter-shared'
import { UpdateImpact } from 'ground0'
import '../cloudflare-workers'

type TestDb = {
	select: () => {
		from: () => {
			where: () => {
				limit: () => {
					get: () => Promise<{ value: number } | undefined>
				}
			}
		}
	}
	insert: () => {
		values: () => {
			onConflictDoUpdate: () => {
				execute: () => Promise<void>
			}
		}
	}
}

type TestCtx = {
	blockConcurrencyWhile: (fn: () => Promise<void> | void) => Promise<void>
}

type UpdateRecord = {
	update: unknown
	opts?: unknown
}

type ConfirmParams = {
	db: TestDb
	connectionId: string
	transitionId: number
	data: unknown
}

vi.mock('ground0/durable_object', () => {
	class SyncEngineBackend {
		protected ctx: TestCtx
		protected db: TestDb
		public __updates: UpdateRecord[] = []

		constructor(
			ctx: TestCtx,
			env: { __testDb: TestDb },
			_options?: { drizzleVerbose?: boolean }
		) {
			this.ctx = ctx
			this.db = env.__testDb
		}

		protected update(update: unknown, opts?: unknown) {
			this.__updates.push({ update, opts })
		}
	}

	return { SyncEngineBackend }
})

import { SyncEngineDO, default as worker } from './index'

const createTestCtx = () => {
	let lastBlock: Promise<void> | undefined
	const ctx: TestCtx = {
		blockConcurrencyWhile: (fn) => {
			const promise = Promise.resolve().then(fn)
			lastBlock = promise
			return promise
		}
	}

	return {
		ctx,
		waitForBlock: async () => {
			if (lastBlock) await lastBlock
		}
	}
}

const createTestDb = (
	options: {
		initialValue?: number
		insertError?: Error
	} = {}
) => {
	const get = vi.fn(async () => {
		if (typeof options.initialValue === 'number')
			return { value: options.initialValue }
		return undefined
	})
	const limit = vi.fn(() => ({ get }))
	const where = vi.fn(() => ({ limit }))
	const from = vi.fn(() => ({ where }))
	const select = vi.fn(() => ({ from }))

	const execute = vi.fn(async () => {
		if (options.insertError) throw options.insertError
	})
	const onConflictDoUpdate = vi.fn(() => ({ execute }))
	const values = vi.fn(() => ({ onConflictDoUpdate }))
	const insert = vi.fn(() => ({ values }))

	return {
		db: { select, insert } satisfies TestDb,
		select,
		insert,
		get,
		execute
	}
}

const createInstance = (dbOptions?: { initialValue?: number; insertError?: Error }) => {
	const { ctx, waitForBlock } = createTestCtx()
	const { db, insert } = createTestDb(dbOptions)
	const instance = new SyncEngineDO(ctx, { __testDb: db })

	return { instance, waitForBlock, db, insert }
}

const getIncrementConfirm = (instance: SyncEngineDO) => {
	const handlers = (instance as unknown as {
		backendHandlers: Record<
			TransitionAction,
			{ confirm: (params: ConfirmParams) => Promise<boolean> }
		>
	}).backendHandlers
	return handlers[TransitionAction.Increment].confirm
}

describe('SyncEngineDO autoruns', () => {
	it('sends the default value when no db record exists', async () => {
		const { instance, waitForBlock } = createInstance()
		await waitForBlock()

		const onConnect = (instance as unknown as {
			autoruns: { onConnect: (id: string) => Promise<void> }
		}).autoruns.onConnect
		await onConnect('client-a')

		const updates = (instance as unknown as { __updates: UpdateRecord[] })
			.__updates
		expect(updates).toEqual([
			{
				update: {
					action: UpdateAction.InitialValue,
					impact: UpdateImpact.Unreliable,
					data: { value: 0 }
				},
				opts: { target: 'client-a' }
			}
		])
	})

	it('uses the stored count when a db record exists', async () => {
		const { instance, waitForBlock } = createInstance({ initialValue: 41 })
		await waitForBlock()

		const onConnect = (instance as unknown as {
			autoruns: { onConnect: (id: string) => Promise<void> }
		}).autoruns.onConnect
		await onConnect('client-b')

		const updates = (instance as unknown as { __updates: UpdateRecord[] })
			.__updates
		expect(updates).toEqual([
			{
				update: {
					action: UpdateAction.InitialValue,
					impact: UpdateImpact.Unreliable,
					data: { value: 41 }
				},
				opts: { target: 'client-b' }
			}
		])
	})
})

describe('SyncEngineDO backendHandlers', () => {
	it('returns false when the random gate rejects', async () => {
		const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.75)
		const { instance, db, insert } = createInstance()

		const confirm = getIncrementConfirm(instance)
		const result = await confirm({
			db,
			connectionId: 'conn-a',
			transitionId: 1,
			data: undefined
		})

		const updates = (instance as unknown as { __updates: UpdateRecord[] })
			.__updates
		expect(result).toBe(false)
		expect(insert).not.toHaveBeenCalled()
		expect(updates).toHaveLength(0)
		randomSpy.mockRestore()
	})

	it('increments and broadcasts on success', async () => {
		const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.25)
		const { instance, db, insert } = createInstance()

		const confirm = getIncrementConfirm(instance)
		const result = await confirm({
			db,
			connectionId: 'conn-b',
			transitionId: 9,
			data: undefined
		})

		const onConnect = (instance as unknown as {
			autoruns: { onConnect: (id: string) => Promise<void> }
		}).autoruns.onConnect
		await onConnect('client-c')

		const updates = (instance as unknown as { __updates: UpdateRecord[] })
			.__updates
		expect(result).toBe(true)
		expect(insert).toHaveBeenCalledOnce()
		expect(updates[0]).toEqual({
			update: {
				action: UpdateAction.Increment,
				impact: UpdateImpact.Unreliable
			},
			opts: { doNotTarget: 'conn-b' }
		})
		expect(updates[1]).toEqual({
			update: {
				action: UpdateAction.InitialValue,
				impact: UpdateImpact.Unreliable,
				data: { value: 1 }
			},
			opts: { target: 'client-c' }
		})
		randomSpy.mockRestore()
	})

	it('logs and returns false when the db insert fails', async () => {
		const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.25)
		const error = new Error('insert failed')
		const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
		const { instance, db, insert } = createInstance({ insertError: error })

		const confirm = getIncrementConfirm(instance)
		const result = await confirm({
			db,
			connectionId: 'conn-c',
			transitionId: 3,
			data: undefined
		})

		const updates = (instance as unknown as { __updates: UpdateRecord[] })
			.__updates
		expect(result).toBe(false)
		expect(insert).toHaveBeenCalledOnce()
		expect(updates).toHaveLength(0)
		expect(consoleSpy).toHaveBeenCalledWith('Error while incrementing:', error)
		consoleSpy.mockRestore()
		randomSpy.mockRestore()
	})
})

describe('worker fetch handler', () => {
	it('returns 404 for non-ws requests', async () => {
		const response = await worker.fetch(
			new Request('https://example.com/nope'),
			{} as Parameters<typeof worker.fetch>[1],
			{} as Parameters<typeof worker.fetch>[2]
		)
		expect(response.status).toBe(404)
	})

	it('forwards ws requests to the durable object', async () => {
		const request = new Request('https://example.com/ws')
		const fetchSpy = vi.fn(async () => new Response('ok', { status: 200 }))
		const env = {
			SYNC_ENGINE_DO: {
				idFromName: vi.fn(() => 'counter-id'),
				get: vi.fn(() => ({ fetch: fetchSpy }))
			}
		} satisfies Parameters<typeof worker.fetch>[1]

		const response = await worker.fetch(
			request,
			env,
			{} as Parameters<typeof worker.fetch>[2]
		)

		expect(env.SYNC_ENGINE_DO.idFromName).toHaveBeenCalledWith('counter')
		expect(env.SYNC_ENGINE_DO.get).toHaveBeenCalledWith('counter-id')
		expect(fetchSpy).toHaveBeenCalledWith(request)
		expect(response.status).toBe(200)
	})
})
