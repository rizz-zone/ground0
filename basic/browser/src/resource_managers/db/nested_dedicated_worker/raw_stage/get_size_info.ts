import { SizeProbeError } from '@/errors'
import {
	BROWSER_QUOTA,
	DB_COUNT_PROBE_MISBEHAVIOUR,
	DB_PAGE_COUNT_PROBE,
	DB_SIZE_PROBE,
	DB_SIZE_PROBE_MISBEHAVIOUR
} from '@/errors/messages'
import * as DbConstants from 'wa-sqlite/src/sqlite-constants.js'

export async function getSizeInfo(sqlite3: SQLiteAPI, db: number) {
	let pageSizeBytes: number | undefined
	if (
		(await sqlite3.exec(db, `PRAGMA page_size;`, (row) => {
			pageSizeBytes = row[0] as number | undefined
		})) !== DbConstants.SQLITE_OK
	)
		throw new SizeProbeError(DB_SIZE_PROBE)
	if (typeof pageSizeBytes === 'undefined')
		throw new SizeProbeError(DB_SIZE_PROBE_MISBEHAVIOUR)
	let pageCount: number | undefined
	if (
		(await sqlite3.exec(db, `PRAGMA page_count;`, (row) => {
			pageCount = row[0] as number | undefined
		})) !== DbConstants.SQLITE_OK
	)
		throw new SizeProbeError(DB_PAGE_COUNT_PROBE)
	if (typeof pageCount === 'undefined')
		throw new SizeProbeError(DB_COUNT_PROBE_MISBEHAVIOUR)

	const { quota: quotaBytes } = await navigator.storage.estimate()
	if (!quotaBytes) throw new SizeProbeError(BROWSER_QUOTA)

	return {
		pageSizeBytes,
		pageCount,
		dbSizeBytes: pageSizeBytes * pageCount,
		quotaBytes
	}
}
