/// <reference lib="webworker" />

import { WorkerLocalFirst } from '@/helpers/worker_thread'
import {
	UpstreamWorkerMessageType,
	type UpstreamWorkerMessage
} from '@/types/internal_messages/UpstreamWorkerMessage'
import {
	type Transition,
	WorkerDoubleInitError,
	workerDoubleInit
} from '@ground0/shared'

let called = false
export function workerEntrypoint<TransitionSchema extends Transition>() {
	if (called) throw new WorkerDoubleInitError(workerDoubleInit(false))
	called = true

	const ourObject = new WorkerLocalFirst()

	self.onmessage = (
		event: MessageEvent<UpstreamWorkerMessage<TransitionSchema>>
	) => {
		const message = event.data
		switch (message.type) {
			case UpstreamWorkerMessageType.Init: {
				const { wsUrl, dbName } = message.data
				ourObject.init({ wsUrl, dbName })
				return
			}
			case UpstreamWorkerMessageType.Ping: {
				console.error(
					"main thread tried to ping worker even though it isn't a SharedWorker!"
				)
				return
			}
		}
	}
	self.onmessageerror = (e) => {
		console.error('Message error!')
		console.error(e)
	}
}
