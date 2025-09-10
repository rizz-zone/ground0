import {
	UpstreamWorkerMessageType,
	type UpstreamWorkerMessage
} from '@/types/internal_messages/UpstreamWorkerMessage'
import {
	NoPortsError,
	type Transition,
	type TransitionSchema
} from '@ground0/shared'

const ctx = self as unknown as
	| SharedWorkerGlobalScope
	| DedicatedWorkerGlobalScope

export function workerEntrypoint<T extends Transition>() {
	const ports: MessagePort[] = []

	// Establish a WorkerLocalFirst
	// TODO: Fill this part out

	// Set listeners
	if ('onconnect' in ctx) {
		ctx.onconnect = (event) => {
			const port = event.ports[0]
			// TODO: Update error message
			if (!port)
				throw new NoPortsError(
					'onconnect fired, but there is no associated port'
				)

			ports.push(port)
		}
	} else {
		self.onmessage = (
			event: MessageEvent<UpstreamWorkerMessage<TransitionSchema<T>>>
		) => {
			const message = event.data
			switch (message.type) {
				case UpstreamWorkerMessageType.Transition: {
					// TODO: Tell the WorkerLocalFirst about the transition
				}
			}
		}
	}
}
