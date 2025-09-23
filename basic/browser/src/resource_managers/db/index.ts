import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { brandedLog } from '@/common/branded_log'
import { sizeInfo } from './raw_stage/size_info'
import { setDbHardSizeLimit } from './raw_stage/set_size_limit'
import { drizzlify } from './drizzle_stage/drizzlify'
import { migrate } from './drizzle_stage/migrate'
import type { GeneratedMigrationSchema } from '@ground0/shared'
import { getRawSqliteDb } from './raw_stage'
import { ResourceInitError } from '@/errors'
import { DB_DOWNLOAD_ERROR, DB_INIT_ERROR } from '@/errors/messages'

export async function connectDb({
	syncResources,
	dbName,
	pullWasmBinary,
	migrations
}: {
	syncResources: (modifications: Partial<ResourceBundle>) => void
	pullWasmBinary: () => Promise<ArrayBuffer>
	dbName: string
	migrations: GeneratedMigrationSchema
}) {
	const signalNeverConnecting = () =>
		syncResources({ db: { status: DbResourceStatus.NeverConnecting } })

	let sqlite3: SQLiteAPI, db: number
	try {
		;({ sqlite3, db } = await getRawSqliteDb({ dbName, pullWasmBinary }))
	} catch (e) {
		signalNeverConnecting()
		throw new ResourceInitError(DB_DOWNLOAD_ERROR, { cause: e })
	}

	try {
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
		signalNeverConnecting()
		throw new ResourceInitError(DB_INIT_ERROR, { cause: e })
	}
}
