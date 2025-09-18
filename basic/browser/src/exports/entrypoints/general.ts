import { brandedLog } from '@/common/branded_log'
import { SHAREDWORKER_NO_PORTS } from '@/common/error_messages'
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
	pullWasmBinary,
	wsUrl,
	dbName
}: LocalEngineDefinition<MemoryModel, T>) {
	const ports: MessagePort[] = []

	function broadcastMessage(message: DownstreamWorkerMessage<MemoryModel>) {
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
		pullWasmBinary
	})

	function onmessage(
		event: MessageEvent<UpstreamWorkerMessage<T>>,
		port?: MessagePort
	) {
		const message = event.data
		switch (message.type) {
			case UpstreamWorkerMessageType.Transition:
				workerLocalFirst.transition(message.data)
				return
			case UpstreamWorkerMessageType.Close: {
				if (!port) return
				const idx = ports.indexOf(port)
				if (idx !== -1) ports.splice(idx, 1)
				return
			}
			case UpstreamWorkerMessageType.DebugLog:
				brandedLog(console.debug, message.message)
				return
		}
	}
	function onmessageerror() {
		brandedLog(
			console.error,
			'There was a message error while receiving an upstream message!'
		)
	}

	// Set listeners
	if ('onconnect' in ctx)
		ctx.onconnect = (event) => {
			const port = event.ports[0]
			if (!port) throw new NoPortsError(SHAREDWORKER_NO_PORTS)

			ports.push(port)
			port.postMessage({
				type: DownstreamWorkerMessageType.InitMemoryModel,
				memoryModel: workerLocalFirst.memoryModel
			} satisfies DownstreamWorkerMessage<MemoryModel>)
			port.onmessage = onmessage
			port.onmessageerror = onmessageerror
		}
	else {
		ctx.postMessage({
			type: DownstreamWorkerMessageType.InitMemoryModel,
			memoryModel: workerLocalFirst.memoryModel
		} satisfies DownstreamWorkerMessage<MemoryModel>)
		ctx.onmessage = onmessage
		ctx.onmessageerror = onmessageerror
	}
}
