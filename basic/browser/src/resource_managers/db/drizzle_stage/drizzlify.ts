import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { baseDrizzleQuery } from './base_query'
import * as DbConstants from 'wa-sqlite/src/sqlite-constants.js'
import {
	DB_BEGIN_TRANSACTION,
	DB_COMMIT_TRANSACTION,
	DB_ROLLBACK_TRANSACTION
} from '@/errors/messages'
import { DbQueryBatchingError } from '@/errors'
import type { LocalDatabase } from '@ground0/shared'

export function drizzlify(sqlite3: SQLiteAPI, db: number): LocalDatabase {
	// TODO: (some day) put the actual db response in with the cause, where the
	// error was numeric instead of an exception

	const lockName = `dbop_${db}`
	return drizzle(
		async (sql, params, method) => {
			return await navigator.locks.request(lockName, () =>
				baseDrizzleQuery({ sqlite3, db, sql, params, method })
			)
		},
		async (queries) => {
			return await navigator.locks.request(lockName, async () => {
				if (
					(await sqlite3.exec(db, `BEGIN TRANSACTION;`, () => {})) !==
					DbConstants.SQLITE_OK
				)
					throw new DbQueryBatchingError(DB_BEGIN_TRANSACTION)

				const queryResults: { rows: unknown[] | unknown[][] }[] = []
				try {
					for (const { sql, params, method } of queries) {
						queryResults.push(
							await baseDrizzleQuery({ sqlite3, db, sql, params, method })
						)
					}
				} catch (e) {
					if (
						(await sqlite3.exec(db, `ROLLBACK;`, () => {})) !==
						DbConstants.SQLITE_OK
					)
						throw new DbQueryBatchingError(DB_ROLLBACK_TRANSACTION, {
							cause: e
						})
					throw e
				}

				// After all queries succeed
				if (
					(await sqlite3.exec(db, `COMMIT;`, () => {})) !==
					DbConstants.SQLITE_OK
				)
					throw new DbQueryBatchingError(DB_COMMIT_TRANSACTION)

				return queryResults
			})
		}
	)
}
