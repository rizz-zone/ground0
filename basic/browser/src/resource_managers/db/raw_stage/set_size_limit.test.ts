/// <reference types="wa-sqlite/src/types" />

import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as DbConstants from 'wa-sqlite/src/sqlite-constants.js'
import { setDbHardSizeLimit } from './set_size_limit'

let execImpl: (
	...input: Parameters<SQLiteAPI['exec']>
) => Promise<typeof DbConstants.SQLITE_OK | typeof DbConstants.SQLITE_ERROR>
const exec = vi
	.fn()
	.mockImplementation((...input: Parameters<typeof execImpl>) =>
		execImpl(...input)
	)

const sqlite3 = {
	exec
} as unknown as SQLiteAPI
const db = 34938098982
const quotaBytes = 1000
const pageSizeBytes = 100

beforeEach(() => {
	execImpl = () => Promise.resolve(DbConstants.SQLITE_OK)
	vi.clearAllMocks()
})

describe('setDbHardSizeLimit', () => {
	test('calculates maxPages and maxBytes correctly', async () => {
		const { maxPages, maxBytes } = await setDbHardSizeLimit({
			pageSizeBytes,
			quotaBytes,
			sqlite3,
			db
		})
		expect(maxBytes).toBe(Math.floor(quotaBytes * 0.9))
		expect(maxPages).toBe(Math.floor(maxBytes / pageSizeBytes))
	})

	test('calls sqlite3.exec with the correct PRAGMA command', async () => {
		const { maxPages } = await setDbHardSizeLimit({
			pageSizeBytes,
			quotaBytes,
			sqlite3,
			db
		})
		expect(exec).toHaveBeenCalledWith(
			db,
			`PRAGMA max_page_count = ${maxPages};`
		)
	})

	test('throws an error when sqlite3.exec returns an error', async () => {
		execImpl = () => Promise.resolve(DbConstants.SQLITE_ERROR)
		await expect(
			setDbHardSizeLimit({
				pageSizeBytes,
				quotaBytes,
				sqlite3,
				db
			})
		).rejects.toThrow('Could not set max_page_count')
	})
})