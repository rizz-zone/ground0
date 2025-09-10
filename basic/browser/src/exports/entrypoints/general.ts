import { brandedLog } from '@/common/branded_log'
import { WorkerLocalFirst } from '@/helpers/worker_thread'
import type { LocalEngineDefinition } from '@/types/LocalEngineDefinition'
import {
	DownstreamWorkerMessageType,
	type DownstreamWorkerMessage
} from '@/types/internal_messages/DownstreamWorkerMessage'
import {
	UpstreamWorkerMessageType,
	type UpstreamWorkerMessage
} from '@/types/internal_messages/UpstreamWorkerMessage'
import { NoPortsError, type Transition } from '@ground0/shared'

const ctx = self as unknown as
	| SharedWorkerGlobalScope
	| DedicatedWorkerGlobalScope

export function workerEntrypoint<
	MemoryModel extends object,
	T extends Transition
>({
	engineDef,
	localHandlers,
	initialMemoryModel,
	migrations,
	pullWasmBinary,
	wsUrl,
	dbName
}: LocalEngineDefinition<MemoryModel, T>) {
	const ports: MessagePort[] = []

	function broadcastMessage(message: DownstreamWorkerMessage) {
		if ('onconnect' in ctx) for (const port of ports) port.postMessage(message)
		else ctx.postMessage(message)
	}

	// Establish a WorkerLocalFirst
	const workerLocalFirst = new WorkerLocalFirst({
		wsUrl,
		dbName,
		engineDef,
		localHandlers,
		initialMemoryModel,
		announceTransformation: (transformation) =>
			broadcastMessage({
				type: DownstreamWorkerMessageType.Transformation,
				transformation
			}),
		pullWasmBinary,
		migrations
	})

	function onmessage(event: MessageEvent<UpstreamWorkerMessage<T>>) {
		const message = event.data
		switch (message.type) {
			case UpstreamWorkerMessageType.Transition:
				workerLocalFirst.transition(message.data)
				break
		}
	}
	function onmessageerror() {
		brandedLog(
			console.error,
			'There was a message error while receiving an upstream message!'
		)
	}

	// Set listeners
	// TODO: Send the state of the memory model on connect
	if ('onconnect' in ctx) {
		ctx.onconnect = (event) => {
			const port = event.ports[0]
			// TODO: Update error message
			if (!port)
				throw new NoPortsError(
					'onconnect fired, but there is no associated port'
				)

			ports.push(port)
			port.onmessage = onmessage
			port.onmessageerror = onmessageerror
		}
	} else {
		ctx.onmessage = onmessage
		ctx.onmessageerror = onmessageerror
	}
}
