import {
	type UpstreamWorkerMessage,
	UpstreamWorkerMessageType
} from '@/types/internal_messages/UpstreamWorkerMessage'
import type { Transition } from '@ground0/shared'

function isShared(worker: Worker | SharedWorker): worker is SharedWorker {
	return 'port' in worker
}

export class BrowserLocalFirst<TransitionSchema extends Transition> {
	private readonly worker: Worker | SharedWorker
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
		dbName,
		wsUrl,
		worker
	}: {
		dbName: string
		wsUrl: string
		worker: Worker | SharedWorker
	}) {
		this.worker = worker // The user or adapter **must** define this because the way workers are invoked is not standardised across build systems
		this.submitWorkerMessage({
			type: UpstreamWorkerMessageType.Init,
			data: { dbName, wsUrl }
		})
		if (isShared(this.worker))
			this.pingTimer = setInterval(
				() =>
					this.submitWorkerMessage({ type: UpstreamWorkerMessageType.Ping }),
				5 * 1000
			)
	}
	public transition(transition: TransitionSchema) {
		this.submitWorkerMessage({
			type: UpstreamWorkerMessageType.Transition,
			data: transition
		})
	}

	// TODO: Symbol.dispose
}
