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

	constructor(worker: Worker | SharedWorker) {
		// It's the consumer's responsibility to provide this because, while
		// Worker and SharedWorker are standard browser features, they are
		// implemented differently depending on the build system. We need to
		// find a way that always work for the core. Framework-specific
		// adapters can decide how to provide it best, though.
		this.worker = worker
	}
	public transition(transition: TransitionSchema) {
		this.submitWorkerMessage({
			type: UpstreamWorkerMessageType.Transition,
			data: transition
		})
	}

	[Symbol.dispose]() {
		this.submitWorkerMessage({ type: UpstreamWorkerMessageType.Close })
	}
}
