import { brandedLog } from '@/common/branded_log'
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
	// TODO: More specific errors
	brandedLog(console.debug, 'Executing with params:', sql, params, method)

	const rows: unknown[][] = []
	let error: Error | null = null

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
					error = new Error(
						`Expected ${DbConstants.SQLITE_ROW} response (at step), got ${rowResult}`
					)
					break // Don't throw, just break
				}

				const row = sqlite3.row(stmt)
				rows.push(row)
				if (method === 'get') break
			}

			if (error) break // Exit after cleanup
		}
	} catch (e) {
		error = e as Error
	}

	// Now throw after SQLite is done
	if (error) {
		brandedLog(
			console.error,
			'query failed:',
			error,
			'sql:',
			sql,
			'params:',
			params
		)
		throw error
	}

	const result =
		method === 'get'
			? { rows: typeof rows[0] !== 'undefined' ? rows[0] : [] }
			: { rows }
	brandedLog(console.debug, 'Returning', result)
	return result
}
