import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { baseDrizzleQuery } from './base_query'
import * as DbConstants from 'wa-sqlite/src/sqlite-constants.js'

export function drizzlify(sqlite3: SQLiteAPI, db: number) {
	// TODO: More specific errors
	// TODO: Also acquire locks to ensure concurrent commands don't happen
	// (since we can't use WAL mode, and all this is async after all)

	return drizzle(
		(sql, params, method) =>
			baseDrizzleQuery({ sqlite3, db, sql, params, method }),
		async (queries) => {
			if (
				(await sqlite3.exec(db, `BEGIN TRANSACTION;`, () => {})) !==
				DbConstants.SQLITE_OK
			)
				throw new Error('Could not begin transaction for batch!')

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
					throw new Error(
						'Tried to run transaction, failed, and could not rollback'
					)
				throw e
			}

			// After all queries succeed
			if (
				(await sqlite3.exec(db, `COMMIT;`, () => {})) !== DbConstants.SQLITE_OK
			)
				throw new Error('Could not commit transaction')

			return queryResults
		}
	)
}
