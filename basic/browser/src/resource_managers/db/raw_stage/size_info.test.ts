// TODO: The whole file

import { beforeEach, describe, test, vi } from 'vitest'
import { SQLITE_OK } from 'wa-sqlite'

let execImpl: () => unknown
const sqlite3 = { exec: vi.fn() } as unknown as SQLiteAPI

beforeEach(() => {
	execImpl = () => SQLITE_OK
})

describe('page size check', () => {
	test('does not throw if successful', () => {
		execImpl = (_db, command, cb) => {}
	})
})
