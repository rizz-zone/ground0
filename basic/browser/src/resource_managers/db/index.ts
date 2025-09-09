// @ts-expect-error wa-sqlite has limited type definitions
import { OPFSCoopSyncVFS } from 'wa-sqlite/src/examples/OPFSCoopSyncVFS.js'
// @ts-expect-error wa-sqlite has limited type definitions
import { Factory } from 'wa-sqlite/src/sqlite-api.js'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { brandedLog } from '@/common/branded_log'
import { createModule } from './raw_stage/create_module'
import { sizeInfo } from './raw_stage/size_info'
import { setDbHardSizeLimit } from './raw_stage/set_size_limit'
import { drizzlify } from './drizzle_stage/drizzlify'
import { migrate } from './drizzle_stage/migrate'
import type { Migrations } from '@/types/Migrations'

export async function connectDb({
	syncResources,
	dbName,
	pullWasmBinary,
	migrations
}: {
	syncResources: (modifications: Partial<ResourceBundle>) => unknown
	pullWasmBinary: () => Promise<ArrayBuffer>
	dbName: string
	migrations: Migrations
}) {
	try {
		// Get the wasm with the code of the adapter. It's the adapter's
		// responsibility to do this, including providing a retry method.
		const module = await createModule(pullWasmBinary)
		// The module will be undefined if onrejected was called.
		if (typeof module === 'undefined')
			return syncResources({ db: { status: DbResourceStatus.NeverConnecting } })

		const sqlite3: SQLiteAPI = Factory(module)

		// Register our virtual filesystem and set it as the default immediately.
		const vfs = await OPFSCoopSyncVFS.create('opfs', module)
		sqlite3.vfs_register(vfs, true)

		// Open the database. db is a pointer to this specific opened db, and must
		// be passed in to methods under sqlite3 so it knows where to apply things.
		const db = await sqlite3.open_v2(dbName)

		const { pageSizeBytes, dbSizeBytes, quotaBytes } = await sizeInfo(
			sqlite3,
			db
		)
		brandedLog(
			console.debug,
			`${dbName} is using ${dbSizeBytes}B (${quotaBytes}B available - ${Math.floor(dbSizeBytes / quotaBytes) * 100}% used)`
		)
		// TODO: If we're getting dangerously close to the max size, signal to the
		// main thread that the consumer should probably urge the user to provide
		// the persistent storage permission.

		// Limit the db's size based off what we just got.
		const { maxBytes, maxPages } = await setDbHardSizeLimit({
			pageSizeBytes,
			quotaBytes,
			sqlite3,
			db
		})
		brandedLog(
			console.debug,
			`Set max_page_count to ${maxPages} (~${maxBytes}B)`
		)

		const drizzleDb = drizzlify(sqlite3, db)
		await migrate(drizzleDb, migrations)

		syncResources({
			db: { status: DbResourceStatus.ConnectedAndMigrated, instance: drizzleDb }
		})
	} catch (e) {
		syncResources({ db: { status: DbResourceStatus.NeverConnecting } })
		throw e
	}
}
