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
import type { UpstreamDbWorkerInitMessage } from '@/types/internal_messages/UpstreamDbWorkerInitMessage'
import type { DownstreamDbWorkerInitMessage } from '@/types/internal_messages/DownstreamDbWorkerInitMessage'

// This will always run as a dedicated worker.
const ctx = self as DedicatedWorkerGlobalScope

let dbBundle:
	| {
			sqlite3: SQLiteAPI
			db: number
	  }
	| undefined

async function init({
	dbName,
	buffer,
	port,
	die
}: {
	dbName: string
	buffer: ArrayBuffer
	port: MessagePort
	die: () => unknown
}) {
	brandedLog(console.debug, 'Acquired lock for db', dbName)

	try {
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
	} catch (e) {
		port.postMessage({
			type: DownstreamDbWorkerMessageType.NotConnecting
		} satisfies DownstreamDbWorkerMessage)
		brandedLog(console.error, 'Could not init db!', e)
		die()
		return
	}

	brandedLog(console.debug, 'db is ready at', performance.now())
	port.postMessage({
		type: DownstreamDbWorkerMessageType.Ready
	} satisfies DownstreamDbWorkerMessage)

	port.onmessage = async (
		rawMessage: MessageEvent<UpstreamDbWorkerMessage>
	) => {
		const message = rawMessage.data
		switch (message.type) {
			case UpstreamDbWorkerMessageType.ExecOne: {
				let result: Awaited<ReturnType<typeof baseDrizzleQuery>>

				try {
					/* v8 ignore branch */
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
					port.postMessage({
						type: DownstreamDbWorkerMessageType.SingleFailedExecResult
					} satisfies DownstreamDbWorkerMessage)
					brandedLog(console.error, 'Drizzle (single) query failed:', e)
					return
				}

				port.postMessage({
					type: DownstreamDbWorkerMessageType.SingleSuccessfulExecResult,
					result
				} satisfies DownstreamDbWorkerMessage)
				break
			}
			case UpstreamDbWorkerMessageType.ExecBatch: {
				/* v8 ignore branch */
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
						(await sqlite3.exec(db, `BEGIN TRANSACTION;`, () => {})) !==
						SQLITE_OK
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

					port.postMessage({
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
				port.postMessage({
					type: DownstreamDbWorkerMessageType.BatchFailedExecResult
				} satisfies DownstreamDbWorkerMessage)
			}
		}
	}
}

export function dbWorkerEntrypoint(dbName: string) {
	brandedLog(console.debug, 'db worker entrypoint loaded at', performance.now())
	ctx.onmessage = (rawMessage: MessageEvent<UpstreamDbWorkerInitMessage>) => {
		const { buffer } = rawMessage.data
		brandedLog(console.debug, 'wasm buffer received, requesting lock for db...')
		navigator.locks.request(`ground0::db_${dbName}`, () => {
			brandedLog(console.debug, 'db lock acquired at', performance.now())
			return new Promise((die) => {
				const { port1, port2 } = new MessageChannel()
				ctx.postMessage(
					{ port: port2 } satisfies DownstreamDbWorkerInitMessage,
					[port2]
				)
				init({
					dbName,
					buffer,
					port: port1,
					die: die as () => unknown
				})
			})
		})
	}
}
