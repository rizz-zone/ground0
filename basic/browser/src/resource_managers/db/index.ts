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
	private portReady = false
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

	private readonly thenableQueue = new Set<
		[SomeAsyncSuccessfulWorkerResultHandler, () => unknown]
	>()
	private readonly lockedThenable = {
		then: (
			handler: SomeAsyncSuccessfulWorkerResultHandler,
			onRejection: () => unknown
		) => this.thenableQueue.add([handler, onRejection])
	}
	private currentHotMessage?: UpstreamDbWorkerMessage & {
		type:
			| UpstreamDbWorkerMessageType.ExecOne
			| UpstreamDbWorkerMessageType.ExecBatch
	}

	private readonly opLocked = <T extends (...args: unknown[]) => unknown>(
		callback: Parameters<typeof navigator.locks.request>[2] & T
	) => navigator.locks.request(`ground0::dbop_${this.dbName}`, callback)
	private readonly db = drizzle(
		(...input) =>
			this.opLocked(() => {
				this.currentHotMessage = {
					type: UpstreamDbWorkerMessageType.ExecOne,
					params: input
				}
				this.port?.postMessage(this.currentHotMessage)
				return this.lockedThenable
			}) as Promise<
				(DownstreamDbWorkerMessage & {
					type: DownstreamDbWorkerMessageType.SingleSuccessfulExecResult
				})['result']
			>,
		(...input) =>
			this.opLocked(() => {
				this.currentHotMessage = {
					type: UpstreamDbWorkerMessageType.ExecBatch,
					params: input
				}
				this.port?.postMessage(this.currentHotMessage)
				return this.lockedThenable
			}) as Promise<
				(DownstreamDbWorkerMessage & {
					type: DownstreamDbWorkerMessageType.BatchSuccessfulExecResult
				})['result']
			>
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
					clearTimeout(this.neverConnectingTimeout)
					if (this.status === DbResourceStatus.Disconnected)
						try {
							migrate(this.db, this.migrations).then(
								() => {
									brandedLog(
										console.debug,
										'db is now migrated, syncing resources'
									)
									this.syncDbResource({
										status: DbResourceStatus.ConnectedAndMigrated,
										instance: this.db
									})
								},
								(e) => {
									brandedLog(
										console.error,
										'A migration error occurred while wrapping the nested worker:',
										e
									)
								}
							)
						} catch (e) {
							brandedLog(
								console.error,
								'An error occurred while wrapping the nested worker:',
								e
							)
						}
					else {
						brandedLog(console.debug, 'Swapping workers!')
						// Request the current blocking tx if one exists
						if (this.currentHotMessage) {
							port.postMessage(this.currentHotMessage)
							brandedLog(console.debug, 'Retrying queued message')
						}
					}
					break
				}
				case DownstreamDbWorkerMessageType.SingleSuccessfulExecResult:
				case DownstreamDbWorkerMessageType.BatchSuccessfulExecResult:
					this.currentHotMessage = undefined
					;(
						this.thenableQueue as Set<
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
					this.thenableQueue.clear()
					break
				case DownstreamDbWorkerMessageType.SingleFailedExecResult:
				case DownstreamDbWorkerMessageType.BatchFailedExecResult:
					this.currentHotMessage = undefined
					this.thenableQueue.forEach((thenable) => {
						try {
							thenable[1]()
						} catch (e) {
							brandedLog(console.error, e)
						}
					})
					this.thenableQueue.clear()
					break
			}
		}
	}
}
