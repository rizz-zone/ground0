import * as DbConstants from 'wa-sqlite/src/sqlite-constants.js'

export async function sizeInfo(sqlite3: SQLiteAPI, db: number) {
	// TODO: Use our own errors instead of these ones for Clarity

	let pageSizeBytes: number | undefined
	if (
		(await sqlite3.exec(db, `PRAGMA page_size;`, (row) => {
			pageSizeBytes = row[0] as number | undefined
		})) !== DbConstants.SQLITE_OK
	)
		throw new Error('Could not get page size')
	let pageCount: number | undefined
	if (
		(await sqlite3.exec(db, `PRAGMA page_count;`, (row) => {
			pageCount = row[0] as number | undefined
		})) !== DbConstants.SQLITE_OK
	)
		throw new Error('Could not get page count')
	if (typeof pageSizeBytes === 'undefined' || typeof pageCount === 'undefined')
		throw new Error('SQLite is not reporting storage')

	const { quota: quotaBytes } = await navigator.storage.estimate()
	if (!quotaBytes) throw new Error('Browser is not reporting storage quota')

	return {
		pageSizeBytes,
		pageCount,
		dbSizeBytes: pageSizeBytes * pageCount,
		quotaBytes
	}
}
