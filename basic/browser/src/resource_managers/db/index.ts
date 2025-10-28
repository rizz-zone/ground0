import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { brandedLog } from '@/common/branded_log'
import { getSizeInfo } from './nested_dedicated_worker/raw_stage/get_size_info'
import { setDbHardSizeLimit } from './nested_dedicated_worker/raw_stage/set_size_limit'
import { drizzlify } from './drizzle_stage/drizzlify'
import { migrate } from './drizzle_stage/migrate'
import type { GeneratedMigrationSchema } from '@ground0/shared'
import { getRawSqliteDb } from './nested_dedicated_worker/raw_stage'
import { ResourceInitError } from '@/errors'
import { DB_DOWNLOAD, DB_INIT } from '@/errors/messages'
import {
	UpstreamDbWorkerMessageType,
	type UpstreamDbWorkerMessage
} from '@/types/internal_messages/UpstreamDbWorkerMessage'

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
	const binaryPromise = pullWasmBinary()
	const dbWorker = new Worker(
		new URL('./nested_dedicated_worker', import.meta.url)
	)
	const signalNeverConnecting = () =>
		syncResources({ db: { status: DbResourceStatus.NeverConnecting } })

	binaryPromise.then(
		(wasmBuffer) => {
			dbWorker.postMessage(
				{
					type: UpstreamDbWorkerMessageType.Init,
					buffer: wasmBuffer,
					dbName
				} satisfies UpstreamDbWorkerMessage,
				[wasmBuffer]
			)
		},
		() => {
			signalNeverConnecting()
		}
	)

	let sqlite3: SQLiteAPI, db: number
	try {
		;({ sqlite3, db } = await getRawSqliteDb({ dbName, pullWasmBinary }))
	} catch (e) {
		signalNeverConnecting()
		throw new ResourceInitError(DB_DOWNLOAD, { cause: e })
	}

	try {
		const drizzleDb = drizzlify(sqlite3, db)
		await migrate(drizzleDb, migrations)

		syncResources({
			db: { status: DbResourceStatus.ConnectedAndMigrated, instance: drizzleDb }
		})
	} catch (e) {
		signalNeverConnecting()
		throw new ResourceInitError(DB_INIT, { cause: e })
	}
}
