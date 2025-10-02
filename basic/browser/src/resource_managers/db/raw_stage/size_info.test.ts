/// <reference types="wa-sqlite/src/types" />

import { beforeEach, describe, expect, test, vi } from 'vitest'
import * as DbConstants from 'wa-sqlite/src/sqlite-constants.js'
import { sizeInfo } from './size_info'
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

beforeEach(() => {
	execImpl = async () => DbConstants.SQLITE_OK
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
		sizeInfo(sqlite3, db)
		await vi.waitFor(() => exec.mock.calls.length >= 1, { interval: 1 })
		expect(exec).toHaveBeenCalled()
		const callParams = exec.mock.calls[0]
		if (!callParams) throw new Error()
		expect(callParams[0]).toBe(db)
		expect(callParams[1]).toContain('PRAGMA')
		expect(callParams[1]).toContain('page_size')
		expect(callParams[2]).toBeTypeOf('function')
	})
	test('throws if unsuccessful', () => {
		execImpl = async () => DbConstants.SQLITE_ERROR
		expect(() => sizeInfo(sqlite3, db)).rejects.toThrow(SizeProbeError)
	})
})
describe('page count check', () => {
	test('does not throw if successful', async () => {
		// @ts-expect-error We need to be able to pause execution at the page
		// count step
		execImpl = (_db, command, cb) => {
			if (!cb) throw new Error()
			cb([3], [''])
			return Promise.resolve(DbConstants.SQLITE_OK)
		}
		storageEstimateImpl = () => new Promise(() => {})
		sizeInfo(sqlite3, db)
		await vi.waitFor(() => exec.mock.calls.length >= 2, { interval: 1 })
		expect(exec).toHaveBeenCalledTimes(2)
		const callParams = exec.mock.lastCall
		if (!callParams) throw new Error()
		expect(callParams[0]).toBe(db)
		expect(callParams[1]).toContain('PRAGMA')
		expect(callParams[1]).toContain('page_count')
		expect(callParams[2]).toBeTypeOf('function')
	})
	test('throws if unsuccessful', () => {
		execImpl = (_db, command, cb) => {
			if (command.includes('count'))
				return Promise.resolve(DbConstants.SQLITE_ERROR)
			if (!cb) throw new Error()
			cb([3], [''])
			return Promise.resolve(DbConstants.SQLITE_OK)
		}
		expect(() => sizeInfo(sqlite3, db)).rejects.toThrow(SizeProbeError)
	})
})
