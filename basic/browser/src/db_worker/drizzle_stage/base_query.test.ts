/// <reference types="wa-sqlite/src/types" />

import { beforeEach, describe, expect, test, vi } from 'vitest'

// Import the function under test
import { baseDrizzleQuery } from './base_query'

// Import dependencies to mock
import { brandedLog } from '@/common/branded_log'
import { LocalQueryExecutionError } from '@/errors'
import * as DbConstants from 'wa-sqlite/src/sqlite-constants.js'

// Mock dependencies
vi.mock('@/common/branded_log', () => ({
	brandedLog: vi.fn()
}))

vi.mock('@/errors', () => ({
	LocalQueryExecutionError: class LocalQueryExecutionError extends Error {
		constructor(message: string, options?: { cause?: unknown }) {
			super(message)
			this.name = 'LocalQueryExecutionError'
			if (options?.cause) {
				;(this as Error & { cause?: unknown }).cause = options.cause
			}
		}
	}
}))

vi.mock('wa-sqlite/src/sqlite-constants.js', () => ({
	SQLITE_ROW: 100,
	SQLITE_DONE: 101,
	SQLITE_ERROR: 1,
	SQLITE_BUSY: 5,
	SQLITE_LOCKED: 6
}))

describe('baseDrizzleQuery', () => {
	let sqlite3: SQLiteAPI
	let db: number
	let mockStmt: number
	let statements: ReturnType<typeof vi.fn>
	let bind_collection: ReturnType<typeof vi.fn>
	let step: ReturnType<typeof vi.fn>
	let row: ReturnType<typeof vi.fn>

	beforeEach(() => {
		vi.clearAllMocks()

		// Mock statement object
		mockStmt = {} as unknown as number

		// Mock SQLite API methods
		statements = vi.fn()
		bind_collection = vi.fn()
		step = vi.fn()
		row = vi.fn()

		sqlite3 = {
			statements,
			bind_collection,
			step,
			row
		} as unknown as SQLiteAPI

		db = 42
	})

	describe('successful query execution', () => {
		test('executes SELECT query with all method', async () => {
			const sql = 'SELECT * FROM users'
			const params: unknown[] = []
			const method = 'all' as const

			// Mock successful execution
			statements.mockReturnValue([mockStmt])
			step
				.mockResolvedValueOnce(DbConstants.SQLITE_ROW)
				.mockResolvedValueOnce(DbConstants.SQLITE_ROW)
				.mockResolvedValueOnce(DbConstants.SQLITE_DONE)
			row.mockReturnValueOnce(['Alice', 25]).mockReturnValueOnce(['Bob', 30])

			const result = await baseDrizzleQuery({
				sqlite3,
				db,
				sql,
				params,
				method
			})

			expect(result).toEqual({
				rows: [
					['Alice', 25],
					['Bob', 30]
				]
			})

			expect(statements).toHaveBeenCalledWith(db, sql)
			expect(bind_collection).not.toHaveBeenCalled()
			expect(step).toHaveBeenCalledTimes(3)
			expect(row).toHaveBeenCalledTimes(2)
		})

		test('executes query with parameters', async () => {
			const sql = 'SELECT * FROM users WHERE age > ?'
			const params = [18]
			const method = 'all' as const

			statements.mockReturnValue([mockStmt])
			step
				.mockResolvedValueOnce(DbConstants.SQLITE_ROW)
				.mockResolvedValueOnce(DbConstants.SQLITE_DONE)
			row.mockReturnValueOnce(['Adult', 25])

			const result = await baseDrizzleQuery({
				sqlite3,
				db,
				sql,
				params,
				method
			})

			expect(result).toEqual({
				rows: [['Adult', 25]]
			})

			expect(bind_collection).toHaveBeenCalledWith(mockStmt, params)
		})

		test('executes query with get method (single row)', async () => {
			const sql = 'SELECT * FROM users WHERE id = ?'
			const params = [1]
			const method = 'get' as const

			statements.mockReturnValue([mockStmt])
			step
				.mockResolvedValueOnce(DbConstants.SQLITE_ROW)
				.mockResolvedValueOnce(DbConstants.SQLITE_DONE)
			row.mockReturnValueOnce(['Alice', 25])

			const result = await baseDrizzleQuery({
				sqlite3,
				db,
				sql,
				params,
				method
			})

			expect(result).toEqual({
				rows: ['Alice', 25]
			})

			expect(step).toHaveBeenCalledTimes(1) // Should stop after first row
		})

		test('executes query with get method (no rows)', async () => {
			const sql = 'SELECT * FROM users WHERE id = ?'
			const params = [999]
			const method = 'get' as const

			statements.mockReturnValue([mockStmt])
			step.mockResolvedValueOnce(DbConstants.SQLITE_DONE)
			row.mockReturnValue([])

			const result = await baseDrizzleQuery({
				sqlite3,
				db,
				sql,
				params,
				method
			})

			expect(result).toEqual({
				rows: []
			})
		})

		test('executes query with run method', async () => {
			const sql = 'INSERT INTO users (name, age) VALUES (?, ?)'
			const params = ['Charlie', 35]
			const method = 'run' as const

			statements.mockReturnValue([mockStmt])
			step.mockResolvedValueOnce(DbConstants.SQLITE_DONE)

			const result = await baseDrizzleQuery({
				sqlite3,
				db,
				sql,
				params,
				method
			})

			expect(result).toEqual({
				rows: []
			})
		})

		test('executes query with values method', async () => {
			const sql = 'SELECT name FROM users'
			const params: unknown[] = []
			const method = 'values' as const

			statements.mockReturnValue([mockStmt])
			step
				.mockResolvedValueOnce(DbConstants.SQLITE_ROW)
				.mockResolvedValueOnce(DbConstants.SQLITE_ROW)
				.mockResolvedValueOnce(DbConstants.SQLITE_DONE)
			row.mockReturnValueOnce(['Alice']).mockReturnValueOnce(['Bob'])

			const result = await baseDrizzleQuery({
				sqlite3,
				db,
				sql,
				params,
				method
			})

			expect(result).toEqual({
				rows: [['Alice'], ['Bob']]
			})
		})

		test('handles multiple statements', async () => {
			const sql = 'SELECT 1; SELECT 2;'
			const params: unknown[] = []
			const method = 'all' as const

			const mockStmt1 = {} as unknown as number
			const mockStmt2 = {} as unknown as number

			statements.mockReturnValue([mockStmt1, mockStmt2])
			step
				.mockResolvedValueOnce(DbConstants.SQLITE_ROW)
				.mockResolvedValueOnce(DbConstants.SQLITE_DONE)
				.mockResolvedValueOnce(DbConstants.SQLITE_ROW)
				.mockResolvedValueOnce(DbConstants.SQLITE_DONE)
			row.mockReturnValueOnce([1]).mockReturnValueOnce([2])

			const result = await baseDrizzleQuery({
				sqlite3,
				db,
				sql,
				params,
				method
			})

			expect(result).toEqual({
				rows: [[1], [2]]
			})

			expect(bind_collection).not.toHaveBeenCalled() // No params, so no binding
		})
	})

	describe('error handling', () => {
		test('throws LocalQueryExecutionError when step returns non-ROW/DONE', async () => {
			const sql = 'SELECT * FROM users'
			const params: unknown[] = []
			const method = 'all' as const

			statements.mockReturnValue([mockStmt])
			step.mockResolvedValueOnce(DbConstants.SQLITE_ERROR)

			await expect(
				baseDrizzleQuery({
					sqlite3,
					db,
					sql,
					params,
					method
				})
			).rejects.toThrow(LocalQueryExecutionError)

			// Verify the error message includes the query details
			try {
				await baseDrizzleQuery({
					sqlite3,
					db,
					sql,
					params,
					method
				})
			} catch (error) {
				expect(error).toBeInstanceOf(LocalQueryExecutionError)
				expect((error as Error).message).toContain('Query failed overall')
				expect((error as Error).message).toContain(sql)
				expect((error as Error).message).toContain('Params:')
			}
		})

		test('throws LocalQueryExecutionError when statements throws', async () => {
			const sql = 'INVALID SQL'
			const params: unknown[] = []
			const method = 'all' as const

			const originalError = new Error('SQL syntax error')
			statements.mockImplementation(() => {
				throw originalError
			})

			await expect(
				baseDrizzleQuery({
					sqlite3,
					db,
					sql,
					params,
					method
				})
			).rejects.toThrow(LocalQueryExecutionError)

			try {
				await baseDrizzleQuery({
					sqlite3,
					db,
					sql,
					params,
					method
				})
			} catch (error) {
				expect(error).toBeInstanceOf(LocalQueryExecutionError)
				expect((error as Error & { cause?: unknown }).cause).toBe(originalError)
			}
		})

		test('throws LocalQueryExecutionError when bind_collection throws', async () => {
			const sql = 'SELECT * FROM users WHERE id = ?'
			const params = ['invalid']
			const method = 'all' as const

			statements.mockReturnValue([mockStmt])
			const bindError = new Error('Binding failed')
			bind_collection.mockImplementation(() => {
				throw bindError
			})

			await expect(
				baseDrizzleQuery({
					sqlite3,
					db,
					sql,
					params,
					method
				})
			).rejects.toThrow(LocalQueryExecutionError)

			try {
				await baseDrizzleQuery({
					sqlite3,
					db,
					sql,
					params,
					method
				})
			} catch (error) {
				expect(error).toBeInstanceOf(LocalQueryExecutionError)
				expect((error as Error & { cause?: unknown }).cause).toBe(bindError)
			}
		})

		test('handles error in first statement and stops processing', async () => {
			const sql = 'SELECT * FROM users'
			const params: unknown[] = []
			const method = 'all' as const

			const mockStmt1 = {} as unknown as number
			const mockStmt2 = {} as unknown as number

			statements.mockReturnValue([mockStmt1, mockStmt2])
			step.mockResolvedValueOnce(DbConstants.SQLITE_ERROR)

			await expect(
				baseDrizzleQuery({
					sqlite3,
					db,
					sql,
					params,
					method
				})
			).rejects.toThrow(LocalQueryExecutionError)

			try {
				await baseDrizzleQuery({
					sqlite3,
					db,
					sql,
					params,
					method
				})
			} catch (error) {
				expect(error).toBeInstanceOf(LocalQueryExecutionError)
				// Only one error should be collected since we break after first error
				expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(
					LocalQueryExecutionError
				)
			}
		})

		test('collects multiple errors if cleanup also fails', async () => {
			const sql = 'SELECT * FROM users'
			const params: unknown[] = []
			const method = 'all' as const

			const mockStmt1 = {} as unknown as number

			// Create a generator that yields one statement and then throws in finally
			const cleanupError = new Error('Cleanup error')
			async function* mockStatements() {
				try {
					yield mockStmt1
				} finally {
					// This throw will be caught by the outer try-catch in baseDrizzleQuery
					// when the for-await loop is broken
					// eslint-disable-next-line no-unsafe-finally
					throw cleanupError
				}
			}

			statements.mockReturnValue(mockStatements())
			step.mockResolvedValueOnce(DbConstants.SQLITE_ERROR)

			try {
				await baseDrizzleQuery({
					sqlite3,
					db,
					sql,
					params,
					method
				})
			} catch (error) {
				expect(error).toBeInstanceOf(LocalQueryExecutionError)
				const cause = (error as Error).cause
				if (!Array.isArray(cause as unknown[])) {
					throw new Error('Expected cause to be an array')
				}
				const errorCauses = cause as unknown[]
				expect(errorCauses).toHaveLength(2)
				expect(errorCauses[0]).toBeInstanceOf(LocalQueryExecutionError)
				expect(errorCauses[1]).toBe(cleanupError)
			}
		})
	})

	describe('logging', () => {
		test('logs query execution start', async () => {
			const sql = 'SELECT 1'
			const params = [42]
			const method = 'all' as const

			statements.mockReturnValue([mockStmt])
			step.mockResolvedValueOnce(DbConstants.SQLITE_DONE)

			await baseDrizzleQuery({
				sqlite3,
				db,
				sql,
				params,
				method
			})

			expect(brandedLog).toHaveBeenCalledWith(
				expect.any(Function),
				'Executing with params:',
				sql,
				params,
				method
			)
		})

		test('logs query result', async () => {
			const sql = 'SELECT 1'
			const params: unknown[] = []
			const method = 'all' as const

			statements.mockReturnValue([mockStmt])
			step
				.mockResolvedValueOnce(DbConstants.SQLITE_ROW)
				.mockResolvedValueOnce(DbConstants.SQLITE_DONE)
			row.mockReturnValueOnce([1])

			await baseDrizzleQuery({
				sqlite3,
				db,
				sql,
				params,
				method
			})

			expect(brandedLog).toHaveBeenCalledWith(
				expect.any(Function),
				'Returning',
				{ rows: [[1]] }
			)
		})
	})

	describe('edge cases', () => {
		test('handles empty result set', async () => {
			const sql = 'SELECT * FROM empty_table'
			const params: unknown[] = []
			const method = 'all' as const

			statements.mockReturnValue([mockStmt])
			step.mockResolvedValueOnce(DbConstants.SQLITE_DONE)

			const result = await baseDrizzleQuery({
				sqlite3,
				db,
				sql,
				params,
				method
			})

			expect(result).toEqual({
				rows: []
			})
		})

		test('handles zero parameters', async () => {
			const sql = 'SELECT 1'
			const params: unknown[] = []
			const method = 'all' as const

			statements.mockReturnValue([mockStmt])
			step
				.mockResolvedValueOnce(DbConstants.SQLITE_ROW)
				.mockResolvedValueOnce(DbConstants.SQLITE_DONE)
			row.mockReturnValueOnce([1])

			const result = await baseDrizzleQuery({
				sqlite3,
				db,
				sql,
				params,
				method
			})

			expect(result).toEqual({
				rows: [[1]]
			})

			expect(bind_collection).not.toHaveBeenCalled()
		})

		test('handles get method with undefined first row', async () => {
			const sql = 'SELECT * FROM users WHERE id = ?'
			const params = [999]
			const method = 'get' as const

			statements.mockReturnValue([mockStmt])
			step.mockResolvedValueOnce(DbConstants.SQLITE_DONE)

			const result = await baseDrizzleQuery({
				sqlite3,
				db,
				sql,
				params,
				method
			})

			expect(result).toEqual({
				rows: []
			})
		})
	})
})
