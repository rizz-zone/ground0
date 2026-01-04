import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { UpstreamDbWorkerInitMessage } from '@/types/internal_messages/UpstreamDbWorkerInitMessage'
import type { DownstreamDbWorkerInitMessage } from '@/types/internal_messages/DownstreamDbWorkerInitMessage'
import { DownstreamDbWorkerMessageType } from '@/types/internal_messages/DownstreamDbWorkerMessage'
import {
	UpstreamDbWorkerMessageType,
	type UpstreamDbWorkerMessage
} from '@/types/internal_messages/UpstreamDbWorkerMessage'

// We don't need our stdout cluttered
vi.spyOn(console, 'debug').mockImplementation(() => {})
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

const requestLock = vi.fn()
// @ts-expect-error navigator.locks isn't read-only because the test env does
// not define it whatsoever
navigator.locks = { request: requestLock } as unknown as typeof navigator.locks

const portPostMessage = vi.fn()
const port1 = { postMessage: portPostMessage, onmessage: null },
	port2 = {}
vi.spyOn(globalThis, 'MessageChannel').mockImplementation(() => ({
	port1: port1 as unknown as MessagePort,
	port2: port2 as unknown as MessagePort
}))

const ctx = self as DedicatedWorkerGlobalScope & {
	onmessage: ((ev: MessageEvent<UpstreamDbWorkerInitMessage>) => unknown) | null
}
vi.spyOn(ctx, 'postMessage').mockImplementation(() => {})

const getRawSqliteDb = vi.fn()
vi.doMock('./raw_stage', () => ({ getRawSqliteDb }))

const getSizeInfo = vi.fn()
vi.doMock('./raw_stage/get_size_info', () => ({ getSizeInfo }))

const setDbHardSizeLimit = vi.fn()
vi.doMock('./raw_stage/set_size_limit', () => ({ setDbHardSizeLimit }))

const baseDrizzleQuery = vi.fn()
vi.doMock('./drizzle_stage/base_query', () => ({ baseDrizzleQuery }))

const sqlite3Exec = vi.fn()
const dbBundle = {
	sqlite3: { exec: sqlite3Exec } as unknown as SQLiteAPI,
	db: 12345
}

const sizeInfo = {
	pageSizeBytes: 4096,
	pageCount: 10,
	dbSizeBytes: 40960,
	quotaBytes: 1000000
}

const sizeLimitInfo = {
	maxBytes: 900000,
	maxPages: 219
}

beforeEach(() => {
	vi.clearAllMocks()
	getRawSqliteDb.mockImplementation(async () => dbBundle)
	getSizeInfo.mockImplementation(async () => sizeInfo)
	setDbHardSizeLimit.mockImplementation(async () => sizeLimitInfo)
	baseDrizzleQuery.mockImplementation(async () => ({ rows: [] }))
})
afterEach(() => {
	ctx.onmessage = null
})

const { dbWorkerEntrypoint } = await import('.')

const buffer = new ArrayBuffer()

const DB_NAME = 'test'

// Note: Lines 103-109 and 135-141 in the implementation contain defensive checks
// for !dbBundle, but these are unreachable in normal operation because port.onmessage
// is only set AFTER dbBundle is set (line 79 sets dbBundle, then line 94 sets port.onmessage).
// These checks exist as defensive programming but cannot be tested without modifying
// the implementation or using reflection to manipulate internal state.

describe('dbWorkerEntrypoint', () => {
	it('sets ctx.onmessage', () => {
		expect(ctx.onmessage).not.toBeTypeOf('function')
		dbWorkerEntrypoint(DB_NAME)
		expect(ctx.onmessage).toBeTypeOf('function')
	})
	describe('ctx.onmessage', () => {
		beforeEach(() => dbWorkerEntrypoint(DB_NAME))
		it('requests db lock', ({ skip }) => {
			if (!ctx.onmessage) return skip()
			ctx.onmessage(
				new MessageEvent('message', {
					data: { buffer } satisfies UpstreamDbWorkerInitMessage
				})
			)
			expect(requestLock).toHaveBeenCalledOnce()
			expect(requestLock.mock.lastCall?.[0]).toBe(`ground0::db_${DB_NAME}`)
			expect(requestLock.mock.lastCall?.[1]).toBeTypeOf('function')
		})
		describe('lock callback', () => {
			let lockCallback:
				| (() => unknown & Parameters<typeof navigator.locks.request>[1])
				| undefined = undefined
			beforeEach(({ skip }) => {
				if (!ctx.onmessage) return skip()
				ctx.onmessage(
					new MessageEvent('message', {
						data: { buffer } satisfies UpstreamDbWorkerInitMessage
					})
				)
				lockCallback = requestLock.mock.lastCall?.[1]
				if (!lockCallback) return skip()
			})
			it('creates a port and sends it downstream', async ({ skip }) => {
				if (!lockCallback) return skip()

				// We don't want to test all of init, but we can't force it not
				// to run at all without exporting it from index.ts (we prefer
				// not to export things for testing purposes only unless
				// strictly necessary), so we make the promise it returns never
				// resolve to pause execution instead.
				getRawSqliteDb.mockImplementation(() => new Promise(() => {}))

				expect(MessageChannel).not.toHaveBeenCalled()
				expect(ctx.postMessage).not.toHaveBeenCalled()
				lockCallback()
				return await (async () => {
					expect(MessageChannel).toHaveBeenCalled()
					expect(ctx.postMessage).toHaveBeenCalledOnce()
					expect(
						(
							(ctx.postMessage as unknown as ReturnType<typeof vi.spyOn>).mock
								.lastCall?.[0] as DownstreamDbWorkerInitMessage
						)?.port
					).toEqual(port2)
				})()
			})
		})
	})
})
describe('init', () => {
	let induceInit: () => Promise<unknown>
	beforeEach(({ skip }) => {
		dbWorkerEntrypoint(DB_NAME)
		if (!ctx.onmessage) return skip()
		ctx.onmessage(
			new MessageEvent('message', {
				data: { buffer } satisfies UpstreamDbWorkerInitMessage
			})
		)
		const lockCallback = requestLock.mock.lastCall?.[1] as
			| (() => unknown & Parameters<typeof navigator.locks.request>[1])
			| undefined
		if (!lockCallback) return skip()

		// induceInit wraps lockCallback but resolves once init will have run,
		// instead of never resolving as lockCallback does. This allows us to
		// simply await in tests instead of having to use queueMicrotask or
		// manually return a promise.
		induceInit = async () => {
			lockCallback()
			// Wait for the async init operations to complete
			await vi.waitFor(
				() => {
					return getRawSqliteDb.mock.calls.length > 0
				},
				{ interval: 1, timeout: 1000 }
			)
			// Also wait for the Ready message to be sent (indicating init is complete)
			await vi.waitFor(
				() => {
					return portPostMessage.mock.calls.length > 0
				},
				{ interval: 1, timeout: 1000 }
			)
		}
	})
	describe('db setup', () => {
		it('acquires raw db instance', async () => {
			await induceInit()
			expect(getRawSqliteDb).toHaveBeenCalledOnce()
			expect(getRawSqliteDb.mock.lastCall?.[0]).toMatchObject({
				wasmBinary: buffer,
				dbName: DB_NAME
			})
		})
		it('gets size info', async () => {
			await induceInit()
			expect(getSizeInfo).toHaveBeenCalledOnce()
			expect(getSizeInfo.mock.lastCall?.[0]).toBe(dbBundle.sqlite3)
			expect(getSizeInfo.mock.lastCall?.[1]).toBe(dbBundle.db)
		})
		it('sets size limit', async () => {
			await induceInit()
			expect(setDbHardSizeLimit).toHaveBeenCalledOnce()
			expect(setDbHardSizeLimit.mock.lastCall?.[0]).toMatchObject({
				pageSizeBytes: sizeInfo.pageSizeBytes,
				quotaBytes: sizeInfo.quotaBytes,
				sqlite3: dbBundle.sqlite3,
				db: dbBundle.db
			})
		})
	})
	describe('messaging', () => {
		it('sends ready message after successful init', async () => {
			await induceInit()
			// Wait for the ready message to be sent
			await vi.waitFor(
				() => {
					return portPostMessage.mock.calls.length > 0
				},
				{ interval: 1, timeout: 1000 }
			)
			expect(portPostMessage).toHaveBeenCalledWith({
				type: DownstreamDbWorkerMessageType.Ready
			})
		})
	})
	describe('error handling', () => {
		it('sends NotConnecting message when getRawSqliteDb fails', async () => {
			getRawSqliteDb.mockRejectedValueOnce(new Error('Failed to get raw db'))
			await induceInit()
			// Wait for the error message to be sent
			await vi.waitFor(
				() => {
					return portPostMessage.mock.calls.length > 0
				},
				{ interval: 1, timeout: 1000 }
			)
			expect(portPostMessage).toHaveBeenCalledWith({
				type: DownstreamDbWorkerMessageType.NotConnecting
			})
		})
		it('sends NotConnecting message when getSizeInfo fails', async () => {
			getSizeInfo.mockRejectedValueOnce(new Error('Failed to get size info'))
			await induceInit()
			// Wait for the error message to be sent
			await vi.waitFor(
				() => {
					return portPostMessage.mock.calls.length > 0
				},
				{ interval: 1, timeout: 1000 }
			)
			expect(portPostMessage).toHaveBeenCalledWith({
				type: DownstreamDbWorkerMessageType.NotConnecting
			})
		})
		it('sends NotConnecting message when setDbHardSizeLimit fails', async () => {
			setDbHardSizeLimit.mockRejectedValueOnce(
				new Error('Failed to set size limit')
			)
			await induceInit()
			// Wait for the error message to be sent
			await vi.waitFor(
				() => {
					return portPostMessage.mock.calls.length > 0
				},
				{ interval: 1, timeout: 1000 }
			)
			expect(portPostMessage).toHaveBeenCalledWith({
				type: DownstreamDbWorkerMessageType.NotConnecting
			})
		})
	})
	describe('query execution', () => {
		let port: {
			postMessage: typeof portPostMessage
			onmessage: ((ev: MessageEvent) => unknown) | null
		}
		beforeEach(() => {
			port = port1
		})
		describe('ExecOne', () => {
			it('executes single query successfully', async () => {
				const queryResult = { rows: [{ id: 1, name: 'test' }] }
				baseDrizzleQuery.mockResolvedValueOnce(queryResult)

				await induceInit()
				if (!port.onmessage) throw new Error('port.onmessage not set')

				const sql = 'SELECT * FROM users WHERE id = ?'
				const params = [1]
				const method = 'all'
				await port.onmessage(
					new MessageEvent('message', {
						data: {
							type: UpstreamDbWorkerMessageType.ExecOne,
							params: [sql, params, method]
						} satisfies UpstreamDbWorkerMessage
					})
				)

				expect(baseDrizzleQuery).toHaveBeenCalledWith({
					sqlite3: dbBundle.sqlite3,
					db: dbBundle.db,
					sql,
					params,
					method
				})
				expect(portPostMessage).toHaveBeenLastCalledWith({
					type: DownstreamDbWorkerMessageType.SingleSuccessfulExecResult,
					result: queryResult
				})
			})
			it('handles query failure', async () => {
				baseDrizzleQuery.mockRejectedValueOnce(new Error('Query failed'))

				await induceInit()
				if (!port.onmessage) throw new Error('port.onmessage not set')

				await port.onmessage(
					new MessageEvent('message', {
						data: {
							type: UpstreamDbWorkerMessageType.ExecOne,
							params: ['SELECT * FROM users', [], 'all']
						} satisfies UpstreamDbWorkerMessage
					})
				)

				expect(portPostMessage).toHaveBeenLastCalledWith({
					type: DownstreamDbWorkerMessageType.SingleFailedExecResult
				})
			})
		})
		describe('ExecBatch', () => {
			it('executes batch queries successfully', async () => {
				const queryResults = [{ rows: [{ id: 1 }] }, { rows: [{ id: 2 }] }]
				baseDrizzleQuery
					.mockResolvedValueOnce(queryResults[0])
					.mockResolvedValueOnce(queryResults[1])

				// Mock sqlite3.exec for transaction statements
				sqlite3Exec.mockResolvedValue(0) // SQLITE_OK

				await induceInit()
				if (!port.onmessage) throw new Error('port.onmessage not set')

				const queries = [
					{
						sql: 'INSERT INTO users VALUES (?)',
						params: [1],
						method: 'run' as const
					},
					{
						sql: 'INSERT INTO users VALUES (?)',
						params: [2],
						method: 'run' as const
					}
				]
				await port.onmessage(
					new MessageEvent('message', {
						data: {
							type: UpstreamDbWorkerMessageType.ExecBatch,
							params: [queries]
						} satisfies UpstreamDbWorkerMessage
					})
				)

				expect(portPostMessage).toHaveBeenLastCalledWith({
					type: DownstreamDbWorkerMessageType.BatchSuccessfulExecResult,
					result: queryResults
				})
			})
			it('handles batch query failure and rolls back', async () => {
				baseDrizzleQuery.mockRejectedValueOnce(new Error('Query failed'))

				// Mock sqlite3.exec for transaction statements
				sqlite3Exec.mockResolvedValue(0) // SQLITE_OK

				await induceInit()
				if (!port.onmessage) throw new Error('port.onmessage not set')

				const queries = [
					{
						sql: 'INSERT INTO users VALUES (?)',
						params: [1],
						method: 'run' as const
					}
				]
				await port.onmessage(
					new MessageEvent('message', {
						data: {
							type: UpstreamDbWorkerMessageType.ExecBatch,
							params: [queries]
						} satisfies UpstreamDbWorkerMessage
					})
				)

				expect(portPostMessage).toHaveBeenLastCalledWith({
					type: DownstreamDbWorkerMessageType.BatchFailedExecResult
				})

				// Verify that ROLLBACK was called
				const execCalls = sqlite3Exec.mock.calls
				expect(execCalls.some((call) => call[1].includes('ROLLBACK'))).toBe(
					true
				)
			})
			it('handles rollback failure during batch query error', async () => {
				baseDrizzleQuery.mockRejectedValueOnce(new Error('Query failed'))

				// Mock sqlite3.exec to fail on ROLLBACK
				sqlite3Exec.mockImplementation(async (_db, sql) => {
					if (sql.includes('ROLLBACK')) return 1 // SQLITE_ERROR
					return 0 // SQLITE_OK
				})

				await induceInit()
				if (!port.onmessage) throw new Error('port.onmessage not set')

				const queries = [
					{
						sql: 'INSERT INTO users VALUES (?)',
						params: [1],
						method: 'run' as const
					}
				]
				await port.onmessage(
					new MessageEvent('message', {
						data: {
							type: UpstreamDbWorkerMessageType.ExecBatch,
							params: [queries]
						} satisfies UpstreamDbWorkerMessage
					})
				)

				expect(portPostMessage).toHaveBeenLastCalledWith({
					type: DownstreamDbWorkerMessageType.BatchFailedExecResult
				})

				// Verify that ROLLBACK was attempted
				const execCalls = sqlite3Exec.mock.calls
				expect(execCalls.some((call) => call[1].includes('ROLLBACK'))).toBe(
					true
				)
			})
			it('handles commit failure during batch execution', async () => {
				const queryResults = [{ rows: [{ id: 1 }] }]
				baseDrizzleQuery.mockResolvedValueOnce(queryResults[0])

				// Mock sqlite3.exec to fail on COMMIT
				sqlite3Exec.mockImplementation(async (_db, sql) => {
					if (sql.includes('COMMIT')) return 1 // SQLITE_ERROR
					return 0 // SQLITE_OK
				})

				await induceInit()
				if (!port.onmessage) throw new Error('port.onmessage not set')

				const queries = [
					{
						sql: 'INSERT INTO users VALUES (?)',
						params: [1],
						method: 'run' as const
					}
				]
				await port.onmessage(
					new MessageEvent('message', {
						data: {
							type: UpstreamDbWorkerMessageType.ExecBatch,
							params: [queries]
						} satisfies UpstreamDbWorkerMessage
					})
				)

				expect(portPostMessage).toHaveBeenLastCalledWith({
					type: DownstreamDbWorkerMessageType.BatchFailedExecResult
				})

				// Verify that COMMIT was attempted
				const execCalls = sqlite3Exec.mock.calls
				expect(execCalls.some((call) => call[1].includes('COMMIT'))).toBe(true)
			})
			it('handles begin transaction failure', async () => {
				// Mock sqlite3.exec to fail on BEGIN
				sqlite3Exec.mockImplementation(async (_db, sql) => {
					if (sql.includes('BEGIN')) return 1 // SQLITE_ERROR
					return 0 // SQLITE_OK
				})

				await induceInit()
				if (!port.onmessage) throw new Error('port.onmessage not set')

				const queries = [
					{
						sql: 'INSERT INTO users VALUES (?)',
						params: [1],
						method: 'run' as const
					}
				]
				await port.onmessage(
					new MessageEvent('message', {
						data: {
							type: UpstreamDbWorkerMessageType.ExecBatch,
							params: [queries]
						} satisfies UpstreamDbWorkerMessage
					})
				)

				expect(portPostMessage).toHaveBeenLastCalledWith({
					type: DownstreamDbWorkerMessageType.BatchFailedExecResult
				})

				// Verify that BEGIN was attempted
				const execCalls = sqlite3Exec.mock.calls
				expect(execCalls.some((call) => call[1].includes('BEGIN'))).toBe(true)
			})
		})
	})
})
