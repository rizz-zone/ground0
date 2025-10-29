import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { brandedLog } from '@/common/branded_log'
import { migrate } from './drizzle_stage/migrate'
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

	const thenableQueue = new Set<SomeAsyncSuccessfulWorkerResultHandler>()
	const lockedThenable = {
		then: (handler: SomeAsyncSuccessfulWorkerResultHandler) =>
			thenableQueue.add(handler)
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
				;(
					thenableQueue as Set<
						AsyncSuccessfulWorkerResultHandler<DownstreamDbWorkerMessageType.SingleSuccessfulExecResult>
					>
				).forEach((thenable) => thenable(message.result))
				thenableQueue.clear()
				break
			case DownstreamDbWorkerMessageType.BatchSuccessfulExecResult:
				;(
					thenableQueue as Set<
						AsyncSuccessfulWorkerResultHandler<DownstreamDbWorkerMessageType.BatchSuccessfulExecResult>
					>
				).forEach((thenable) => thenable(message.result))
				thenableQueue.clear()
				break
		}
	}
}
