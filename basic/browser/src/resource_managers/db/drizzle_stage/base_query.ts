import { brandedLog } from '@/common/branded_log'
import { LocalQueryExecutionError } from '@/errors'
import { badRowResult, overallQueryFailure } from '@/errors/messages'
import * as DbConstants from 'wa-sqlite/src/sqlite-constants.js'

export async function baseDrizzleQuery({
	sqlite3,
	db,
	sql,
	params,
	method
}: {
	sqlite3: SQLiteAPI
	db: number
	sql: string
	params: unknown[]
	method: 'all' | 'run' | 'get' | 'values'
}): Promise<{ rows: unknown[] | unknown[][] }> {
	brandedLog(console.debug, 'Executing with params:', sql, params, method)

	const rows: unknown[][] = []
	const errors: unknown[] = []

	try {
		for await (const stmt of sqlite3.statements(db, sql)) {
			if (params.length > 0) {
				sqlite3.bind_collection(stmt, params as SQLiteCompatibleType[])
			}

			for (
				let rowResult = await sqlite3.step(stmt);
				rowResult !== DbConstants.SQLITE_DONE;
				rowResult = await sqlite3.step(stmt)
			) {
				if (rowResult !== DbConstants.SQLITE_ROW) {
					errors.push(
						new LocalQueryExecutionError(
							badRowResult(DbConstants.SQLITE_ROW, rowResult)
						)
					)
					break // Don't throw, just break
				}

				const row = sqlite3.row(stmt)
				rows.push(row)
				if (method === 'get') break
			}

			if (errors.length > 0) break // Exit after cleanup
		}
	} catch (e) {
		errors.push(e)
	}

	// Now throw after SQLite is done
	if (errors.length > 0) {
		throw new LocalQueryExecutionError(overallQueryFailure(sql, params), {
			cause: errors.length === 1 ? errors[0] : errors
		})
	}

	const result =
		method === 'get'
			? { rows: typeof rows[0] !== 'undefined' ? rows[0] : [] }
			: { rows }
	brandedLog(console.debug, 'Returning', result)
	return result
}
