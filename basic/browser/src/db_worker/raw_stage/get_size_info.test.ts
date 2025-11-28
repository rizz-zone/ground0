/// <reference types="wa-sqlite/src/types" />

import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as DbConstants from 'wa-sqlite/src/sqlite-constants.js'
import { getSizeInfo } from './get_size_info'
import { SizeProbeError } from '@/errors'

let execImpl: (
	...input: Parameters<SQLiteAPI['exec']>
) => Promise<typeof DbConstants.SQLITE_OK | typeof DbConstants.SQLITE_ERROR>
const exec = vi
	.fn()
	.mockImplementation((...input: Parameters<typeof execImpl>) =>
		execImpl(...input)
	)
let storageEstimateImpl: typeof navigator.storage.estimate
const storageEstimate = vi
	.fn()
	.mockImplementation(
		(
			...params: Parameters<typeof navigator.storage.estimate>
		): ReturnType<typeof navigator.storage.estimate> =>
			storageEstimateImpl(...params)
	)

// @ts-expect-error jsdom does not provide us with a navigator.storage, so we
// can't just vi.mock
navigator.storage = { estimate: storageEstimate }
const sqlite3 = {
	exec
} as unknown as SQLiteAPI
const db = 34938098982
const quotaBytes = 6769876
const universalSizeOfEverything = 19

beforeEach(() => {
	execImpl = (_db, _command, cb) => {
		if (cb) cb([universalSizeOfEverything], [''])
		return Promise.resolve(DbConstants.SQLITE_OK)
	}
	storageEstimateImpl = async () => ({ quota: quotaBytes })
	vi.clearAllMocks()
})

describe('page size check', () => {
	test('does not throw if successful', async () => {
		execImpl = (_db, command, cb) => {
			if (!cb) throw new Error()
			if (!command.includes('size')) return new Promise(() => {})
			cb([3], [''])
			return Promise.resolve(DbConstants.SQLITE_OK)
		}
		getSizeInfo(sqlite3, db)
		await vi.waitFor(() => exec.mock.calls.length >= 1, { interval: 1 })
		expect(exec).toHaveBeenCalled()
		const callParams = exec.mock.calls[0]
		if (!callParams) throw new Error()
		expect(callParams[0]).toBe(db)
		expect(callParams[1]).toContain('PRAGMA')
		expect(callParams[1]).toContain('page_size')
		expect(callParams[2]).toBeTypeOf('function')
	})
	test('throws if unsuccessful', async () => {
		execImpl = async () => DbConstants.SQLITE_ERROR
		await expect(() => getSizeInfo(sqlite3, db)).rejects.toThrow(SizeProbeError)
	})
	test('throws if rows[0] is not provided', async () => {
		execImpl = (_db, command, cb) => {
			if (!cb) throw new Error()
			if (command.includes('size')) cb([], [])
			else cb([3], [''])
			return Promise.resolve(DbConstants.SQLITE_OK)
		}
		await expect(() => getSizeInfo(sqlite3, db)).rejects.toThrow(SizeProbeError)
	})
})
describe('page count check', () => {
	test('does not throw if successful', async () => {
		execImpl = (_db, _command, cb) => {
			if (!cb) throw new Error()
			cb([3], [''])
			return Promise.resolve(DbConstants.SQLITE_OK)
		}
		storageEstimateImpl = () => new Promise(() => {})
		getSizeInfo(sqlite3, db)
		await vi.waitFor(() => exec.mock.calls.length >= 2, { interval: 1 })
		expect(exec).toHaveBeenCalledTimes(2)
		const callParams = exec.mock.lastCall
		if (!callParams) throw new Error()
		expect(callParams[0]).toBe(db)
		expect(callParams[1]).toContain('PRAGMA')
		expect(callParams[1]).toContain('page_count')
		expect(callParams[2]).toBeTypeOf('function')
	})
	test('throws if unsuccessful', async () => {
		execImpl = (_db, command, cb) => {
			if (command.includes('count'))
				return Promise.resolve(DbConstants.SQLITE_ERROR)
			if (!cb) throw new Error()
			cb([3], [''])
			return Promise.resolve(DbConstants.SQLITE_OK)
		}
		await expect(() => getSizeInfo(sqlite3, db)).rejects.toThrow(SizeProbeError)
	})
	test('throws if rows[0] is not provided', async () => {
		execImpl = (_db, command, cb) => {
			if (!cb) throw new Error()
			if (command.includes('count')) cb([], [])
			else cb([3], [''])
			return Promise.resolve(DbConstants.SQLITE_OK)
		}
		await expect(() => getSizeInfo(sqlite3, db)).rejects.toThrow(SizeProbeError)
	})
})
describe('quota check', () => {
	test('does not throw if successful', async () => {
		storageEstimateImpl = () => Promise.resolve({ quota: 2949 })
		await expect(getSizeInfo(sqlite3, db)).resolves.toBeTypeOf('object')
	})
	test('throws if unsuccessful', async () => {
		storageEstimateImpl = () => Promise.resolve({})
		await expect(() => getSizeInfo(sqlite3, db)).rejects.toThrow(SizeProbeError)
	})
})
test('returns correct object if 100% successful', async () => {
	await expect(getSizeInfo(sqlite3, db)).resolves.toStrictEqual({
		pageSizeBytes: universalSizeOfEverything,
		pageCount: universalSizeOfEverything,
		dbSizeBytes: universalSizeOfEverything ** 2, // pageSizeBytes * pageCount
		quotaBytes
	} satisfies Awaited<ReturnType<typeof getSizeInfo>>)
})
