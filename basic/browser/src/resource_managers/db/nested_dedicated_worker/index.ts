import {
	UpstreamDbWorkerMessageType,
	type UpstreamDbWorkerMessage
} from '@/types/internal_messages/UpstreamDbWorkerMessage'
import { getRawSqliteDb } from './raw_stage'
import {
	DownstreamDbWorkerMessageType,
	type DownstreamDbWorkerMessage
} from '@/types/internal_messages/DownstreamDbWorkerMessage'
import { brandedLog } from '@/common/branded_log'
import { getSizeInfo } from './raw_stage/get_size_info'
import { setDbHardSizeLimit } from './raw_stage/set_size_limit'

// This will always run as a dedicated worker.
const ctx = self as DedicatedWorkerGlobalScope

// Prevent double init
let initReceived = false

let dbBundle:
	| {
			sqlite3: SQLiteAPI
			db: number
	  }
	| undefined

ctx.onmessage = async (rawMessage: MessageEvent<UpstreamDbWorkerMessage>) => {
	const message = rawMessage.data
	switch (message.type) {
		case UpstreamDbWorkerMessageType.Init:
			try {
				const { dbName, buffer } = message
				if (initReceived) return
				initReceived = true

				// Create a db instance

				const { sqlite3, db } = await getRawSqliteDb({
					wasmBinary: buffer,
					dbName: dbName
				})

				// Set a size limit

				const { pageSizeBytes, dbSizeBytes, quotaBytes } = await getSizeInfo(
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

				const { maxBytes, maxPages } = await setDbHardSizeLimit({
					pageSizeBytes,
					quotaBytes,
					sqlite3: sqlite3,
					db: db
				})
				brandedLog(
					console.debug,
					`Set max_page_count to ${maxPages} (~${maxBytes}B)`
				)

				dbBundle = { sqlite3, db }
				ctx.postMessage({
					type: DownstreamDbWorkerMessageType.Ready
				} satisfies DownstreamDbWorkerMessage)
			} catch (e) {
				ctx.postMessage({
					type: DownstreamDbWorkerMessageType.NotConnecting
				} satisfies DownstreamDbWorkerMessage)
				brandedLog(console.error, 'Could not init db!', e)
			}
			break
		case UpstreamDbWorkerMessageType.ExecOne: {
		}
	}
}
