import { brandedLog } from '@/common/branded_log'
import type { DownstreamDbWorkerInitMessage } from '@/types/internal_messages/DownstreamDbWorkerInitMessage'
import { type DownstreamWorkerMessage } from '@/types/internal_messages/DownstreamWorkerMessage'
import type { UpstreamDbWorkerInitMessage } from '@/types/internal_messages/UpstreamDbWorkerInitMessage'
import {
	type UpstreamWorkerMessage,
	UpstreamWorkerMessageType
} from '@/types/internal_messages/UpstreamWorkerMessage'
import type { Transition } from '@ground0/shared'

function isShared(worker: Worker | SharedWorker): worker is SharedWorker {
	return 'port' in worker
}
function logMessageError(workerType: string) {
	brandedLog(
		console.warn,
		`A downstream (${workerType}Worker) message error occurred.`
	)
}
function logError(workerType: string) {
	brandedLog(console.error, `${workerType}Worker failed!`)
}

export class BrowserLocalFirst<
	TransitionSchema extends Transition,
	MemoryModel extends object
> {
	private readonly worker: Worker | SharedWorker
	private downstreamGateOpen = true
	private submitWorkerMessage(
		message: UpstreamWorkerMessage<TransitionSchema>,
		transferables?: Transferable[]
	) {
		const params = [message, transferables] as Parameters<
			MessagePort['postMessage']
		>
		if (isShared(this.worker)) {
			this.worker.port.postMessage(...params)
			return
		}
		this.worker.postMessage(...params)
	}

	constructor({
		worker,
		onMessage,
		pullWasmBinary,
		...conditional
	}: ({ worker: Worker } | { worker: SharedWorker; dbWorker: Worker }) & {
		onMessage: (message: DownstreamWorkerMessage<MemoryModel>) => unknown
		pullWasmBinary: () => Promise<ArrayBuffer>
	}) {
		// It's the consumer's responsibility to provide this because, while
		// Worker and SharedWorker are standard browser features, they are
		// implemented differently depending on the build system. We need to
		// find a way that always work for the core. Framework-specific
		// adapters can decide how to provide it best, though.
		this.worker = worker

		const onmessage = (
			event: MessageEvent<DownstreamWorkerMessage<MemoryModel>>
		) => {
			if (this.downstreamGateOpen) onMessage(event.data)
		}

		if (isShared(worker)) {
			const { dbWorker } = conditional as { dbWorker: Worker }

			worker.port.onmessage = onmessage
			worker.port.onmessageerror = () => logMessageError('Shared')
			worker.onerror = () => logError('Shared')

			try {
				brandedLog(console.debug, 'Attempting to get WASM via user code...')
				pullWasmBinary().then(
					(buffer) => {
						brandedLog(console.debug, 'Success! Sending to db worker')
						dbWorker.postMessage(
							{ buffer } satisfies UpstreamDbWorkerInitMessage,
							[buffer]
						)
					},
					(e) => brandedLog(console.error, 'Obtaining WASM binary failed:', e)
				)
			} catch (e) {
				brandedLog(
					console.error,
					'Obtaining WASM binary failed (synchronously):',
					e
				)
				dbWorker.terminate()
			}
			dbWorker.onmessage = ({
				data: message
			}: MessageEvent<DownstreamDbWorkerInitMessage>) =>
				this.submitWorkerMessage(
					{
						type: UpstreamWorkerMessageType.DbWorkerPrepared,
						port: message.port
					},
					[message.port]
				)
		} else {
			worker.onmessage = onmessage
			worker.onmessageerror = () => logMessageError('Dedicated')
			worker.onerror = () => logError('Dedicated')
		}
	}
	public transition(transition: TransitionSchema) {
		this.submitWorkerMessage({
			type: UpstreamWorkerMessageType.Transition,
			data: transition
		})
	}

	[Symbol.dispose]() {
		this.downstreamGateOpen = false
		this.submitWorkerMessage({ type: UpstreamWorkerMessageType.Close })
		// TODO: Do something with the db worker
	}
}
