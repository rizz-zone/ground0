import { ResourceInitError } from '@/errors'
import { defs } from '@ground0/shared'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const getRawSqliteDb = vi.fn()
vi.doMock('./raw_stage', () => ({
	getRawSqliteDb
}))

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
	test('throws a ResourceInitError on fail', async () => {
		getRawSqliteDb.mockImplementation(async () => {
			throw new Error()
		})
		await expect(connectDb(minimumInput)).rejects.toThrow(ResourceInitError)
	})
})
