import * as DbConstants from 'wa-sqlite/src/sqlite-constants.js'

/**
 * Sets the size limit for an SQLite database.
 * @param inputs Some of the size info (`pageSizeBytes` and `quotaBytes`) reported by [`sizeInfo`](./size_info.ts), as well as the `sqlite3` and `db` needed to `exec` on the database.
 * @returns A promise resolving to an object including the `maxPages` (and corresponding rough `maxBytes`) calculated.
 */
export async function setDbHardSizeLimit({
	pageSizeBytes,
	quotaBytes,
	sqlite3,
	db
}: {
	pageSizeBytes: number
	quotaBytes: number
	sqlite3: SQLiteAPI
	db: number
}) {
	// We'll only limit to 90% of the available space to stay on the safe side.
	const maxBytes = Math.floor(quotaBytes * 0.9)
	const maxPages = Math.floor(maxBytes / pageSizeBytes)
	const setPageLimitResult = await sqlite3.exec(
		db,
		`PRAGMA max_page_count = ${maxPages};`
	)
	if (setPageLimitResult !== DbConstants.SQLITE_OK) {
		// TODO: This error also needs to be made better
		throw new Error('Could not set max_page_count')
	}

	return { maxPages, maxBytes }
}
