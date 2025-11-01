import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { brandedLog } from '@/common/branded_log'
import { migrate } from './migrate'
import type { GeneratedMigrationSchema } from '@ground0/shared'
import {
	UpstreamDbWorkerMessageType,
	type UpstreamDbWorkerMessage
} from '@/types/internal_messages/UpstreamDbWorkerMessage'
import {
	DownstreamDbWorkerMessageType,
	type DownstreamDbWorkerMessage
} from '@/types/internal_messages/DownstreamDbWorkerMessage'
import { drizzle } from 'drizzle-orm/sqlite-proxy'

type AsyncSuccessfulWorkerResultHandler<
	SpecificType extends
		| DownstreamDbWorkerMessageType.SingleSuccessfulExecResult
		| DownstreamDbWorkerMessageType.BatchSuccessfulExecResult
> = (
	result: (DownstreamDbWorkerMessage & {
		type: SpecificType
	})['result']
) => unknown
type SomeAsyncSuccessfulWorkerResultHandler =
	| AsyncSuccessfulWorkerResultHandler<DownstreamDbWorkerMessageType.SingleSuccessfulExecResult>
	| AsyncSuccessfulWorkerResultHandler<DownstreamDbWorkerMessageType.BatchSuccessfulExecResult>

export class DbThinClient {
	private port?: MessagePort
	private syncDbResource: (newDb: ResourceBundle['db']) => void
	private migrations
	private dbName

	private status = DbResourceStatus.Disconnected

	constructor({
		syncResources,
		migrations,
		dbName
	}: {
		syncResources: (modifications: Partial<ResourceBundle>) => void
		migrations: GeneratedMigrationSchema
		dbName: string
	}) {
		this.syncDbResource = (newDb) => {
			this.status = newDb.status
			syncResources({ db: newDb })
		}
		this.migrations = migrations
		this.dbName = dbName
	}

	// The sync engine has 40 seconds to connect to the db before we assume
	// it will never succeed.
	private neverConnectingTimeout = setTimeout(
		() => this.syncDbResource({ status: DbResourceStatus.NeverConnecting }),
		40 * 1000
	)

	public newPort(port: MessagePort) {
		// Cleanup and replacement
		this.port?.close()
		this.port = port

		// New port handlers
		this.port.onmessage = ({
			data: message
		}: MessageEvent<DownstreamDbWorkerMessage>) => {
			// Shouldn't be hit because the db worker should use a lock, but
			// just in case
			if (this.port !== port) return

			switch (message.type) {
				case DownstreamDbWorkerMessageType.NotConnecting:
					// We only set this.port to undefined because there might
					// be another tab that opens and can successfully provide
					// a database connection, so we rely solely on
					// neverConnectingTimeout for controlling when to mark as
					// never connecting.
					this.port = undefined
					break
				case DownstreamDbWorkerMessageType.Ready: {
					const opLocked<T> = (callback: Parameters<(typeof navigator.locks.request)>[2]) => navigator.locks.request(`ground0::dbop_${this.dbName}`, callback)

					try {
						// Migrate and pass
						const db = drizzle(
							async (...input) => {
								return (await navigator.locks.request(
									`ground0::dbop_${dbName}`,
									() => {
										dbWorker.postMessage({
											type: UpstreamDbWorkerMessageType.ExecOne,
											params: input
										} satisfies UpstreamDbWorkerMessage)
										return lockedThenable
									}
								)) as (DownstreamDbWorkerMessage & {
									type: DownstreamDbWorkerMessageType.SingleSuccessfulExecResult
								})['result']
							},
							async (...input) => {
								return (await navigator.locks.request(
									`ground0::dbop_${dbName}`,
									() => {
										dbWorker.postMessage({
											type: UpstreamDbWorkerMessageType.ExecBatch,
											params: input
										} satisfies UpstreamDbWorkerMessage)
										return lockedThenable
									}
								)) as (DownstreamDbWorkerMessage & {
									type: DownstreamDbWorkerMessageType.BatchSuccessfulExecResult
								})['result']
							}
						)
	
						migrate(db, migrations).then(
							() => {
								brandedLog(console.debug, 'db is now migrated, syncing resources')
								syncResources({
									db: {
										status: DbResourceStatus.ConnectedAndMigrated,
										instance: db
									}
								})
							},
							(e) => {
								brandedLog(
									console.error,
									'A migration error occurred while wrapping the nested worker:',
									e
								)
								signalNeverConnecting()
							}
						)
					} catch (e) {
						brandedLog(
							console.error,
							'An error occurred while wrapping the nested worker:',
							e
						)
						signalNeverConnecting()
					}
					break
				}
			}
		}
	}
}

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

	const thenableQueue = new Set<
		[SomeAsyncSuccessfulWorkerResultHandler, () => unknown]
	>()
	const lockedThenable = {
		then: (
			handler: SomeAsyncSuccessfulWorkerResultHandler,
			onRejection: () => unknown
		) => thenableQueue.add([handler, onRejection])
	}

	dbWorker.onmessage = (
		rawMessage: MessageEvent<DownstreamDbWorkerMessage>
	) => {
		const message = rawMessage.data
		switch (message.type) {
			case DownstreamDbWorkerMessageType.NotConnecting:
				signalNeverConnecting()
				break
			case DownstreamDbWorkerMessageType.Ready: {
				try {
					// Migrate and pass
					const db = drizzle(
						async (...input) => {
							return (await navigator.locks.request(
								`ground0::dbop_${dbName}`,
								() => {
									dbWorker.postMessage({
										type: UpstreamDbWorkerMessageType.ExecOne,
										params: input
									} satisfies UpstreamDbWorkerMessage)
									return lockedThenable
								}
							)) as (DownstreamDbWorkerMessage & {
								type: DownstreamDbWorkerMessageType.SingleSuccessfulExecResult
							})['result']
						},
						async (...input) => {
							return (await navigator.locks.request(
								`ground0::dbop_${dbName}`,
								() => {
									dbWorker.postMessage({
										type: UpstreamDbWorkerMessageType.ExecBatch,
										params: input
									} satisfies UpstreamDbWorkerMessage)
									return lockedThenable
								}
							)) as (DownstreamDbWorkerMessage & {
								type: DownstreamDbWorkerMessageType.BatchSuccessfulExecResult
							})['result']
						}
					)

					migrate(db, migrations).then(
						() => {
							brandedLog(console.debug, 'db is now migrated, syncing resources')
							syncResources({
								db: {
									status: DbResourceStatus.ConnectedAndMigrated,
									instance: db
								}
							})
						},
						(e) => {
							brandedLog(
								console.error,
								'A migration error occurred while wrapping the nested worker:',
								e
							)
							signalNeverConnecting()
						}
					)
				} catch (e) {
					brandedLog(
						console.error,
						'An error occurred while wrapping the nested worker:',
						e
					)
					signalNeverConnecting()
				}
				break
			}
			case DownstreamDbWorkerMessageType.SingleSuccessfulExecResult:
			case DownstreamDbWorkerMessageType.BatchSuccessfulExecResult:
				;(
					thenableQueue as Set<
						[
							AsyncSuccessfulWorkerResultHandler<typeof message.type>,
							() => unknown
						]
					>
				).forEach((thenable) => {
					try {
						thenable[0](message.result)
					} catch (e) {
						brandedLog(console.error, e)
					}
				})
				thenableQueue.clear()
				break
			case DownstreamDbWorkerMessageType.SingleFailedExecResult:
			case DownstreamDbWorkerMessageType.BatchFailedExecResult:
				thenableQueue.forEach((thenable) => {
					try {
						thenable[1]()
					} catch (e) {
						brandedLog(console.error, e)
					}
				})
				thenableQueue.clear()
				break
		}
	}
}
