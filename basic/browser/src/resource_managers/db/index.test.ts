import { ResourceInitError } from '@/errors'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { defs } from '@ground0/shared'
import { beforeEach, describe, expect, test, vi } from 'vitest'

let getRawSqliteDbImpl = () => {}
const getRawSqliteDb = vi.fn().mockImplementation(() => getRawSqliteDbImpl())
vi.doMock('./raw_stage', () => ({ getRawSqliteDb }))
let sizeInfoImpl = () => {}
const sizeInfo = vi.fn().mockImplementation(() => sizeInfoImpl())
vi.doMock('./raw_stage/size_info.ts', () => ({ sizeInfo }))
let setDbHardSizeLimitImpl = () => {}
const setDbHardSizeLimit = vi
	.fn()
	.mockImplementation(() => setDbHardSizeLimitImpl())
vi.doMock('./raw_stage/set_size_limit.ts', () => ({ setDbHardSizeLimit }))

const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {})

const { connectDb } = await import('./index')

const minimumInput: Parameters<typeof connectDb>[0] = {
	syncResources: vi.fn(),
	pullWasmBinary: vi.fn(),
	dbName: 'bob',
	migrations: defs.db.migrations
}

const sqlite3 = {}
const db = {}

beforeEach(() => {
	vi.clearAllMocks()
	getRawSqliteDbImpl = async () => ({
		sqlite3,
		db
	})
	sizeInfoImpl = async () => ({
		pageSizeBytes: 1,
		dbSizeBytes: 2,
		quotaBytes: 3
	})
})

describe('getRawSqliteDb step', () => {
	test('requests download and decode using provided dbName and pullWasmBinary', () => {
		getRawSqliteDbImpl = async () => () => {}
		connectDb(minimumInput).catch(() => {})
		expect(getRawSqliteDb).toHaveBeenCalledExactlyOnceWith({
			dbName: minimumInput.dbName,
			pullWasmBinary: minimumInput.pullWasmBinary
		})
		// It's the job of getRawSqliteDb to call
		expect(minimumInput.pullWasmBinary).not.toHaveBeenCalled()
	})
	test('throws a ResourceInitError and marks as never connecting on fail', async () => {
		getRawSqliteDbImpl = async () => {
			throw new Error()
		}
		await expect(connectDb(minimumInput)).rejects.toThrow(ResourceInitError)
		expect(minimumInput.syncResources).toHaveBeenCalledExactlyOnceWith({
			db: {
				status: DbResourceStatus.NeverConnecting
			}
		} as Partial<ResourceBundle>)
	})
})
describe('sizeInfo step', () => {
	test('requests size using sqlite3 and db', async () => {
		sizeInfoImpl = () => new Promise(() => {})
		connectDb(minimumInput)
		await vi.waitFor(() => sizeInfo.mock.lastCall, {
			timeout: 500,
			interval: 2
		})
		expect(sizeInfo).toHaveBeenCalled()
		console.log(sizeInfo.mock.lastCall)
		expect(sizeInfo).toHaveBeenCalledExactlyOnceWith(sqlite3, db)
	})
})
