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
import { baseDrizzleQuery } from './drizzle_stage/base_query'
import { DbQueryBatchingError } from '@/errors'
import {
	DB_BEGIN_TRANSACTION,
	DB_COMMIT_TRANSACTION,
	DB_ROLLBACK_TRANSACTION
} from '@/errors/messages'
import { SQLITE_OK } from 'wa-sqlite/src/sqlite-constants.js'

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
				// TODO: This needs locks pretty urgently so consumers don't
				// make mistakes that corrupt databases!

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
			} catch (e) {
				ctx.postMessage({
					type: DownstreamDbWorkerMessageType.NotConnecting
				} satisfies DownstreamDbWorkerMessage)
				brandedLog(console.error, 'Could not init db!', e)
				break
			}

			ctx.postMessage({
				type: DownstreamDbWorkerMessageType.Ready
			} satisfies DownstreamDbWorkerMessage)
			break
		case UpstreamDbWorkerMessageType.ExecOne: {
			let result: Awaited<ReturnType<typeof baseDrizzleQuery>>

			try {
				if (!dbBundle) {
					brandedLog(
						console.error,
						'Received a query to execute but there is no dbBundle!'
					)
					return
				}
				const { sqlite3, db } = dbBundle

				const [sql, params, method] = message.params
				result = await baseDrizzleQuery({
					sqlite3,
					db,
					sql,
					params,
					method
				})
			} catch (e) {
				ctx.postMessage({
					type: DownstreamDbWorkerMessageType.SingleFailedExecResult
				} satisfies DownstreamDbWorkerMessage)
				brandedLog(console.error, 'Drizzle (single) query failed:', e)
				return
			}

			ctx.postMessage({
				type: DownstreamDbWorkerMessageType.SingleSuccessfulExecResult,
				result
			} satisfies DownstreamDbWorkerMessage)
			break
		}
		case UpstreamDbWorkerMessageType.ExecBatch: {
			if (!dbBundle) {
				brandedLog(
					console.error,
					'Received a query to execute but there is no dbBundle!'
				)
				return
			}
			const { sqlite3, db } = dbBundle

			const errors: unknown[] = []
			const [queries] = message.params

			normalPath: {
				if (
					(await sqlite3.exec(db, `BEGIN TRANSACTION;`, () => {})) !== SQLITE_OK
				) {
					errors.push(new DbQueryBatchingError(DB_BEGIN_TRANSACTION))
					break normalPath
				}

				const queryResults: { rows: unknown[] | unknown[][] }[] = []
				try {
					for (const { sql, params, method } of queries) {
						queryResults.push(
							await baseDrizzleQuery({ sqlite3, db, sql, params, method })
						)
					}
				} catch (e) {
					errors.push(e)
					if ((await sqlite3.exec(db, `ROLLBACK;`, () => {})) !== SQLITE_OK)
						errors.push(
							new DbQueryBatchingError(DB_ROLLBACK_TRANSACTION, {
								cause: e
							})
						)
					break normalPath
				}

				// After all queries succeed
				if ((await sqlite3.exec(db, `COMMIT;`, () => {})) !== SQLITE_OK) {
					errors.push(new DbQueryBatchingError(DB_COMMIT_TRANSACTION))
					break normalPath
				}

				ctx.postMessage({
					type: DownstreamDbWorkerMessageType.BatchSuccessfulExecResult,
					result: queryResults
				} satisfies DownstreamDbWorkerMessage)
				return
			}

			// We'll only reach this if there are errors.
			brandedLog(
				console.error,
				'A batch query request failed:',
				errors.length === 1 ? errors[0] : errors
			)
			ctx.postMessage({
				type: DownstreamDbWorkerMessageType.BatchFailedExecResult
			} satisfies DownstreamDbWorkerMessage)
		}
	}
}
