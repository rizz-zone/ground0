import { defs } from '@ground0/shared'
import { beforeEach, expect, test, vi } from 'vitest'

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

test('requests download and decode using provided dbName and pullWasmBinary', () => {
	getRawSqliteDb.mockImplementation(() => new Promise(() => {}))
	connectDb(minimumInput)
	expect(getRawSqliteDb).toHaveBeenCalledExactlyOnceWith({
		dbName: minimumInput.dbName,
		pullWasmBinary: minimumInput.pullWasmBinary
	})
	// It's the job of `getRawSqliteDb` to call
	expect(minimumInput.pullWasmBinary).not.toHaveBeenCalled()
})
