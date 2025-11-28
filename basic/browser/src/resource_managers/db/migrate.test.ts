import { beforeEach, describe, expect, test, vi } from 'vitest'
import { sql as _sql } from 'drizzle-orm'

// drizzle generated migrations fixture
import { migrations } from '@ground0/shared/testing'

import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { migrate } from './migrate'

describe('migrate', () => {
	let run: ReturnType<typeof vi.fn>
	let values: ReturnType<typeof vi.fn>
	let batch: ReturnType<typeof vi.fn>
	let db: SqliteRemoteDatabase<Record<string, unknown>>

	beforeEach(() => {
		run = vi.fn()
		values = vi.fn()
		batch = vi.fn()

		db = { run, values, batch } as unknown as SqliteRemoteDatabase<
			Record<string, unknown>
		>
		vi.spyOn(console, 'debug').mockImplementation(() => {})
	})

	test('creates migrations table if not exists and inserts applied migration', async () => {
		// no previous migrations
		values.mockResolvedValue([])

		await migrate(db, migrations)

		// first call creates table
		expect(run).toHaveBeenCalled()
		// selects last migration
		expect(values).toHaveBeenCalled()
		// batch executes split SQL + insert into migrations
		expect(batch).toHaveBeenCalled()
		const batchCall = batch.mock.calls[0]
		if (!batchCall) throw new Error('batch not called')
		const batchArg = batchCall[0]
		expect(Array.isArray(batchArg as unknown[])).toBe(true)
		// there is one CREATE TABLE statement in our migration file; plus the insert
		// ensure at least 2 statements are present
		expect((batchArg as unknown[]).length).toBeGreaterThanOrEqual(2)
	})

	test('skips already applied migration based on created_at', async () => {
		// pretend migration already applied (created_at newer or equal)
		const first = migrations.journal.entries[0]
		if (!first) throw new Error('empty migrations journal in fixture')
		const latest = [1, 'hash', String(first.when)] as [number, string, string]
		values.mockResolvedValue([latest])

		await migrate(db, migrations)

		// should not call batch, only create table + select
		expect(batch).not.toHaveBeenCalled()
	})

	test('throws when journal references missing migration', async () => {
		values.mockResolvedValue([])
		const bad = {
			journal: { entries: [{ idx: 1, tag: '9999_missing', when: Date.now() }] },
			migrations: {}
		} as unknown as typeof migrations

		await expect(migrate(db, bad)).rejects.toThrow(/m9999/)
	})
})
