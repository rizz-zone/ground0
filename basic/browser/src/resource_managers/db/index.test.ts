import { ResourceInitError } from '@/errors'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { defs } from '@ground0/shared'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const getRawSqliteDb = vi.fn()
vi.doMock('./raw_stage', () => ({ getRawSqliteDb }))
const sizeInfo = vi.fn()
vi.doMock('./raw_stage/size_info', () => ({ sizeInfo }))

const { connectDb } = await import('./index')

const minimumInput: Parameters<typeof connectDb>[0] = {
	syncResources: vi.fn(),
	pullWasmBinary: vi.fn(),
	dbName: 'bob',
	migrations: defs.db.migrations
}

beforeEach(() => {
	getRawSqliteDb.mockImplementation(async () => {})
	vi.clearAllMocks()
})

const sqlite3 = {}
const db = {}

describe('getRawSqliteDb step', () => {
	test('requests download and decode using provided dbName and pullWasmBinary', () => {
		getRawSqliteDb.mockImplementation(() => new Promise(() => {}))
		connectDb(minimumInput)
		expect(getRawSqliteDb).toHaveBeenCalledExactlyOnceWith({
			dbName: minimumInput.dbName,
			pullWasmBinary: minimumInput.pullWasmBinary
		})
		// It's the job of getRawSqliteDb to call
		expect(minimumInput.pullWasmBinary).not.toHaveBeenCalled()
	})
	test('throws a ResourceInitError and marks as never connecting on fail', async () => {
		getRawSqliteDb.mockImplementation(async () => {
			throw new Error()
		})
		await expect(connectDb(minimumInput)).rejects.toThrow(ResourceInitError)
		expect(minimumInput.syncResources).toHaveBeenCalledExactlyOnceWith({
			db: {
				status: DbResourceStatus.NeverConnecting
			}
		} as Partial<ResourceBundle>)
	})
})
describe('sizeInfo step', () => {
	test('requests size using sqlite3 and db', () => {
		// TODO: return sqlite3 and db, do the test properly
		getRawSqliteDb.mockImplementation(() => new Promise(() => {}))
		connectDb(minimumInput)
		expect(getRawSqliteDb).toHaveBeenCalledExactlyOnceWith({
			dbName: minimumInput.dbName,
			pullWasmBinary: minimumInput.pullWasmBinary
		})
		// It's the job of getRawSqliteDb to call
		expect(minimumInput.pullWasmBinary).not.toHaveBeenCalled()
	})
})
