import { ResourceInitError } from '@/errors'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { defs } from '@ground0/shared'
import { beforeEach, describe, expect, test, vi } from 'vitest'

let getRawSqliteDbImpl: () => unknown
const getRawSqliteDb = vi.fn().mockImplementation(() => getRawSqliteDbImpl())
vi.doMock('./raw_stage', () => ({ getRawSqliteDb }))
let sizeInfoImpl: () => unknown
const sizeInfo = vi.fn().mockImplementation(() => sizeInfoImpl())
vi.doMock('./raw_stage/size_info.ts', () => ({ sizeInfo }))
let setDbHardSizeLimitImpl: () => unknown
const setDbHardSizeLimit = vi
	.fn()
	.mockImplementation(() => setDbHardSizeLimitImpl())
vi.doMock('./raw_stage/set_size_limit.ts', () => ({ setDbHardSizeLimit }))

// This silences debug messages. They're not an essential part of the
// implementation, so we won't use this for testing.
vi.spyOn(console, 'debug').mockImplementation(() => {})

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
	setDbHardSizeLimitImpl = async () => ({
		maxBytes: 3,
		maxPages: 3
	})
})

describe('raw stage', () => {
	describe('getRawSqliteDb step', () => {
		test('requests download and decode using provided dbName and pullWasmBinary', () => {
			getRawSqliteDbImpl = () => new Promise(() => {})
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
			await vi.waitUntil(() => sizeInfo.mock.lastCall, {
				timeout: 500,
				interval: 1
			})
			expect(sizeInfo).toHaveBeenCalled()
			expect(sizeInfo).toHaveBeenCalledExactlyOnceWith(sqlite3, db)
		})
		test('throws a ResourceInitError and marks as never connecting on fail', async () => {
			sizeInfoImpl = async () => {
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
	describe('setDbHardSizeLimit step', () => {
		test('sets new db size limit using relevant values', async () => {
			setDbHardSizeLimitImpl = () => new Promise(() => {})
			connectDb(minimumInput)
			await vi.waitUntil(() => setDbHardSizeLimit.mock.lastCall, {
				timeout: 500,
				interval: 1
			})
			expect(setDbHardSizeLimit).toHaveBeenCalled()
			expect(setDbHardSizeLimit).toHaveBeenCalledExactlyOnceWith({
				pageSizeBytes: 1,
				quotaBytes: 3,
				sqlite3,
				db
			})
		})
		test('throws a ResourceInitError and marks as never connecting on fail', async () => {
			setDbHardSizeLimitImpl = async () => {
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
})
