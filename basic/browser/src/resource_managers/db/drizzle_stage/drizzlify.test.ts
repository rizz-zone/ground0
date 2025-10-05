import { beforeEach, describe, expect, test, vi } from 'vitest'

// constants used by drizzlify
import {
	DB_BEGIN_TRANSACTION,
	DB_COMMIT_TRANSACTION,
	DB_ROLLBACK_TRANSACTION
} from '@/errors/messages'
import { DbQueryBatchingError } from '@/errors'

// subject under test
import { drizzlify } from './drizzlify'

// mock drizzle so we can capture the executor and batcher functions passed in
vi.mock('drizzle-orm/sqlite-proxy', () => {
	return {
		drizzle: vi
			.fn()
			.mockImplementation((executor: unknown, batcher: unknown) => ({
				__executor: executor as (
					sql: string,
					params: unknown[],
					method: 'all' | 'run' | 'get' | 'values'
				) => Promise<unknown>,
				__batcher: batcher as (
					queries: {
						sql: string
						params: unknown[]
						method: 'all' | 'run' | 'get' | 'values'
					}[]
				) => Promise<unknown>
			}))
	}
})

// mock baseDrizzleQuery to control query behavior
let baseQueryImpl: (input: {
	sqlite3: SQLiteAPI
	db: number
	sql: string
	params: unknown[]
	method: 'all' | 'run' | 'get' | 'values'
}) => Promise<{ rows: unknown[] | unknown[][] }>
vi.mock('./base_query', () => ({
	baseDrizzleQuery: vi.fn().mockImplementation((input) => baseQueryImpl(input))
}))

// provide SQLITE_OK for transaction status checks
vi.mock('wa-sqlite/src/sqlite-constants.js', () => ({
	SQLITE_OK: 0
}))

describe('drizzlify', () => {
	let sqlite3: SQLiteAPI
	let dbId: number
	let exec: ReturnType<typeof vi.fn>
	let locksRequest: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.clearAllMocks()

		// minimal sqlite3 mock used by drizzlify (only exec is used here)
		exec = vi.fn()
		sqlite3 = {
			exec
			// the other members are not used by drizzlify directly in this file
		} as unknown as SQLiteAPI

		dbId = 42

		// base query default resolves
		baseQueryImpl = async () => ({ rows: [] })

		// mock navigator.locks.request to run the callback immediately
		locksRequest = vi.fn((_: string, cb: () => unknown) =>
			Promise.resolve(cb())
		)
		// @ts-expect-error adding minimal locks on navigator for tests
		globalThis.navigator.locks = { request: locksRequest }
	})

	test('single query path uses navigator.locks and forwards to baseDrizzleQuery', async () => {
		const db = drizzlify(sqlite3, dbId) as unknown as {
			__executor: (
				sql: string,
				params: unknown[],
				method: 'all' | 'run' | 'get' | 'values'
			) => Promise<unknown>
		}

		const sql = 'SELECT 1'
		const params = [123]
		const method = 'all' as const

		await db.__executor(sql, params, method)

		expect(locksRequest).toHaveBeenCalledTimes(1)
		expect(locksRequest).toHaveBeenCalledWith(
			`dbop_${dbId}`,
			expect.any(Function)
		)
		const { baseDrizzleQuery } = await import('./base_query')
		expect(baseDrizzleQuery).toHaveBeenCalledTimes(1)
		expect(baseDrizzleQuery).toHaveBeenCalledWith({
			sqlite3,
			db: dbId,
			sql,
			params,
			method
		})
	})

	test('batch success begins and commits transaction and returns results', async () => {
		const results = [{ rows: [1] }, { rows: [2] }]
		let call = 0
		baseQueryImpl = async () =>
			results[call++] as unknown as { rows: unknown[] | unknown[][] }

		// BEGIN and COMMIT succeed
		exec.mockResolvedValue(0) // SQLITE_OK for all exec calls

		const db = drizzlify(sqlite3, dbId) as unknown as {
			__batcher: (
				queries: {
					sql: string
					params: unknown[]
					method: 'all' | 'run' | 'get' | 'values'
				}[]
			) => Promise<unknown>
		}

		const queries = [
			{ sql: 'A', params: [1], method: 'all' as const },
			{ sql: 'B', params: [2], method: 'get' as const }
		]
		const out = (await db.__batcher(queries)) as unknown[]

		expect(exec).toHaveBeenCalled()
		// BEGIN called first
		expect(exec.mock.calls[0]?.[1]).toContain('BEGIN')
		// COMMIT called at the end
		const lastCall = exec.mock.calls.at(-1)
		expect(lastCall?.[1]).toContain('COMMIT')

		const { baseDrizzleQuery } = await import('./base_query')
		expect(baseDrizzleQuery).toHaveBeenCalledTimes(2)
		expect(Array.isArray(out)).toBe(true)
		expect(out).toEqual(results)
	})

	test('batch fails when BEGIN fails', async () => {
		// BEGIN fails (non-OK)
		exec.mockResolvedValueOnce(1)

		const db = drizzlify(sqlite3, dbId) as unknown as {
			__batcher: (
				queries: {
					sql: string
					params: unknown[]
					method: 'all' | 'run' | 'get' | 'values'
				}[]
			) => Promise<unknown>
		}

		await expect(db.__batcher([])).rejects.toThrow(DbQueryBatchingError)
		await expect(db.__batcher([])).rejects.toThrow(DB_BEGIN_TRANSACTION)
	})

	test('batch rethrows original error if rollback succeeds', async () => {
		// BEGIN ok
		exec.mockResolvedValueOnce(0)
		// base query throws
		const original = new Error('boom')
		baseQueryImpl = async () => {
			throw original
		}
		// ROLLBACK ok
		exec.mockResolvedValueOnce(0)

		const db = drizzlify(sqlite3, dbId) as unknown as {
			__batcher: (
				queries: {
					sql: string
					params: unknown[]
					method: 'all' | 'run' | 'get' | 'values'
				}[]
			) => Promise<unknown>
		}

		await expect(
			db.__batcher([{ sql: 'X', params: [], method: 'run' }])
		).rejects.toBe(original)
	})

	test('batch throws DbQueryBatchingError with cause if rollback fails', async () => {
		// BEGIN ok
		exec.mockResolvedValueOnce(0)
		const original = new Error('explode')
		baseQueryImpl = async () => {
			throw original
		}
		// ROLLBACK fails
		exec.mockResolvedValueOnce(2)

		const db = drizzlify(sqlite3, dbId) as unknown as {
			__batcher: (
				queries: {
					sql: string
					params: unknown[]
					method: 'all' | 'run' | 'get' | 'values'
				}[]
			) => Promise<unknown>
		}

		let caught: unknown
		try {
			await db.__batcher([{ sql: 'Y', params: [], method: 'run' }])
		} catch (e) {
			caught = e
		}
		const err = caught as DbQueryBatchingError & { cause?: unknown }
		expect(err).toBeInstanceOf(DbQueryBatchingError)
		expect(err.message).toBe(DB_ROLLBACK_TRANSACTION)
		expect('cause' in err).toBe(true)
		expect(err.cause).toBe(original)
	})

	test('batch throws DbQueryBatchingError when COMMIT fails', async () => {
		// BEGIN ok
		exec.mockResolvedValueOnce(0)
		// base query succeeds
		baseQueryImpl = async () => ({ rows: [] })
		// COMMIT fails (non-OK)
		exec.mockResolvedValueOnce(1)

		const db = drizzlify(sqlite3, dbId) as unknown as {
			__batcher: (
				queries: {
					sql: string
					params: unknown[]
					method: 'all' | 'run' | 'get' | 'values'
				}[]
			) => Promise<unknown>
		}

		let commitErr: unknown
		try {
			await db.__batcher([{ sql: 'Z', params: [], method: 'run' }])
		} catch (e) {
			commitErr = e
		}
		expect(commitErr).toBeInstanceOf(DbQueryBatchingError)
		expect((commitErr as Error).message).toBe(DB_COMMIT_TRANSACTION)
	})
})
