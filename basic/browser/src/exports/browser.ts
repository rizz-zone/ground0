import { brandedLog } from '@/common/branded_log'
import { type DownstreamWorkerMessage } from '@/types/internal_messages/DownstreamWorkerMessage'
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
	brandedLog(console.error, `A ${workerType}Worker failed!`)
}

export class BrowserLocalFirst<
	TransitionSchema extends Transition,
	MemoryModel extends object
> {
	private readonly worker: Worker | SharedWorker
	private downstreamGateOpen = true
	private submitWorkerMessage(
		message: UpstreamWorkerMessage<TransitionSchema>
	) {
		if (isShared(this.worker)) {
			this.worker.port.postMessage(message)
			return
		}
		this.worker.postMessage(message)
	}

	constructor({
		worker,
		dbWorker,
		onMessage
	}: {
		worker: Worker | SharedWorker
		dbWorker: Worker
		onMessage: (message: DownstreamWorkerMessage<MemoryModel>) => unknown
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
			worker.port.onmessage = onmessage
			worker.port.onmessageerror = () => logMessageError('Shared')
			worker.onerror = () => logError('Shared')
		} else {
			worker.onmessage = onmessage
			worker.onmessageerror = () => logMessageError('Dedicated')
			worker.onerror = () => logError('Dedicated')
		}

		// TODO: Handle a 'lock acquired' message from the dbWorker
		dbWorker.onmessage = () => {}
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
	}
}
