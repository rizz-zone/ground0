// @ts-expect-error wa-sqlite has limited type definitions
import { OPFSCoopSyncVFS } from 'wa-sqlite/src/examples/OPFSCoopSyncVFS.js'
// @ts-expect-error wa-sqlite has limited type definitions
import { Factory } from 'wa-sqlite/src/sqlite-api.js'
import * as DbConstants from 'wa-sqlite/src/sqlite-constants.js'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { brandedLog } from '@/common/branded_log'
import { createModule } from './create_module'
import { sizeInfo } from './size_info'

export async function connectDb({
	syncResources,
	dbName,
	pullWasmBinary
}: {
	syncResources: (modifications: Partial<ResourceBundle>) => unknown
	pullWasmBinary: () => Promise<ArrayBuffer>
	dbName: string
}) {
	// Get the wasm with the code of the adapter. It's the adapter's
	// responsibility to do this, including providing a retry method
	const module = await createModule(pullWasmBinary)
	// The module will be undefined if onrejected was called
	if (typeof module === 'undefined')
		return syncResources({ db: { status: DbResourceStatus.NeverConnecting } })

	const sqlite3: SQLiteAPI = Factory(module)

	// Register our virtual filesystem and set it as the default immediately.
	const vfs = await OPFSCoopSyncVFS.create('opfs', module)
	sqlite3.vfs_register(vfs, true)

	// Open the database. db is a pointer to this specific opened db, and must
	// be passed in to methods under sqlite3 so it knows where to apply things.
	const db = await sqlite3.open_v2(dbName)

	const { dbSizeBytes, quotaBytes } = await sizeInfo(sqlite3, db)
	brandedLog(
		console.debug,
		`${dbName} is using ${dbSizeBytes}B (${quotaBytes}B available - ${Math.floor(dbSizeBytes / quotaBytes) * 100}% used)`
	)

	// TODO: Make this external as well, and use the new values that are provided by the function
	// Set a page limit so that the database doesn't exceed available
	// quota. We'll use 90% of the available quota as a safety margin.
	const maxBytes = Math.floor(quota * 0.9)
	const maxPages = Math.floor(maxBytes / pageSize)
	const setPageLimitResult = await sqlite3.exec(
		db,
		`PRAGMA max_page_count = ${maxPages};`
	)
	if (setPageLimitResult !== DbConstants.SQLITE_OK) {
		throw new Error('Could not set max_page_count')
	}
	brandedLog(console.debug, `Set max_page_count to ${maxPages} (~${maxBytes}B)`)

	// TODO: Turn this into a drizzle db. This code from the cloneathon
	// will come in handy:
	// https://github.com/ezShroom/rizz-chat/blob/17f6fc962e65642c6a04e8c273be0f16cf99474d/packages/sveltekit/src/lib/sync_layer/workers/backend/storage/index.ts#L135-L163
}
