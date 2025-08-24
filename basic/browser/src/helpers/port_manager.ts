/// <reference lib="webworker" />

import {
	InternalStateError,
	NoPortsError,
	PortDoubleInitError,
	type Transition,
	DOUBLE_SHAREDWORKER_PORT_INIT,
	MAP_DESTRUCTOR_INCONSISTENCY,
	type SyncEngineDefinition,
	type LocalHandlers
} from '@ground0/shared'
import type { InstanceData } from '@/types/instances/InstanceData'
import type { InstanceKey } from '@/types/instances/InstanceKey'
import {
	UpstreamWorkerMessageType,
	type UpstreamWorkerMessage
} from '@/types/internal_messages/UpstreamWorkerMessage'
import { WorkerLocalFirst } from './worker_thread'
import {
	DownstreamWorkerMessageType,
	type DownstreamWorkerMessage
} from '@/types/internal_messages/DownstreamWorkerMessage'

const ctx = self as unknown as SharedWorkerGlobalScope

class WorkerPort<
	MemoryModel extends object,
	TransitionSchema extends Transition
> {
	private readonly syncEngineDefinition: SyncEngineDefinition<TransitionSchema>
	private readonly localHandlers: LocalHandlers<MemoryModel, TransitionSchema>
	private readonly initialMemoryModel: MemoryModel

	private static readonly instances = new Map<
		InstanceKey,
		WorkerLocalFirst<object, Transition>
	>()
	private static readonly activeInstanceClients = new Map<InstanceKey, number>()
	private port?: MessagePort
	private instanceKey?: InstanceKey
	private instance?: WorkerLocalFirst<MemoryModel, TransitionSchema>

	public init(data: InstanceData) {
		// We ignore this condition because it's unlikely to happen, and very hard to test.
		if (this.instanceKey)
			/* v8 ignore next */
			throw new PortDoubleInitError(DOUBLE_SHAREDWORKER_PORT_INIT)

		// We need to set both maps up in order to init this port.
		// Both need an InstanceKey.
		this.instanceKey = `${data.wsUrl}::${data.dbName}`

		// Create the instance if it doesn't exist yet.
		const potentialInstance = (
			this.constructor as typeof WorkerPort
		).instances.get(this.instanceKey)
		// @ts-expect-error It's astronomically unlikely it's not what we want it to be. That would be a consumer skill issue.
		if (potentialInstance) this.instance = potentialInstance
		else {
			this.instance = new WorkerLocalFirst()
			this.instance.init({
				...data,
				engineDef: this.syncEngineDefinition,
				localHandlers: this.localHandlers,
				initialMemoryModel: this.initialMemoryModel,
				announceTransformation: (transformation) =>
					this.port?.postMessage({
						type: DownstreamWorkerMessageType.Transformation,
						transformation
					} satisfies DownstreamWorkerMessage)
			})
			;(this.constructor as typeof WorkerPort).instances.set(
				this.instanceKey,
				// @ts-expect-error We only use the instance in a way that works with any set of type parameters passed into it.
				this.instance
			)
		}

		// Bump clients for this instance by 1.
		// This will create the count if it's new.
		const clients = (
			this.constructor as typeof WorkerPort
		).activeInstanceClients.get(this.instanceKey)
		;(this.constructor as typeof WorkerPort).activeInstanceClients.set(
			this.instanceKey,
			(clients ?? 0) + 1
		)
	}

	private onmessage(
		event: MessageEvent<UpstreamWorkerMessage<TransitionSchema>>
	) {
		const message = event.data
		switch (message.type) {
			case UpstreamWorkerMessageType.Init:
				this.init(message.data)
				break
		}
	}

	constructor({
		port,
		syncEngineDefinition,
		localHandlers,
		initialMemoryModel
	}: {
		port: MessagePort
		syncEngineDefinition: SyncEngineDefinition<TransitionSchema>
		localHandlers: LocalHandlers<MemoryModel, TransitionSchema>
		initialMemoryModel: MemoryModel
	}) {
		this.syncEngineDefinition = syncEngineDefinition
		this.localHandlers = localHandlers
		this.initialMemoryModel = initialMemoryModel
		this.port = port
		this.port.onmessage = this.onmessage.bind(this)
		this.port.onmessageerror = () =>
			console.error(
				'Message error on SharedWorker. This is rare and suggests a browser or hardware issue.'
			)
	}

	[Symbol.dispose]() {
		// Static things get changed first.
		// If the instance never got created, we don't need to clean it up.
		staticCleanup: if (this.instanceKey) {
			// Decrease activeInstanceClients or delete the instance.
			const clients = (
				this.constructor as typeof WorkerPort
			).activeInstanceClients.get(this.instanceKey)
			if (!clients) throw new InternalStateError(MAP_DESTRUCTOR_INCONSISTENCY)
			if (clients === 1) {
				;(this.constructor as typeof WorkerPort).activeInstanceClients.delete(
					this.instanceKey
				)
				;(this.constructor as typeof WorkerPort).instances.delete(
					this.instanceKey
				)
				break staticCleanup
			}
			;(this.constructor as typeof WorkerPort).activeInstanceClients.set(
				this.instanceKey,
				clients - 1
			)
		}

		this.instance = undefined
		this.instanceKey = undefined
		this.port = undefined
	}
}

function init<MemoryModel extends object, TransitionSchema extends Transition>({
	syncEngineDefinition,
	localHandlers,
	initialMemoryModel
}: {
	syncEngineDefinition: SyncEngineDefinition<TransitionSchema>
	localHandlers: LocalHandlers<MemoryModel, TransitionSchema>
	initialMemoryModel: MemoryModel
}) {
	ctx.onconnect = (event) => {
		const port = event.ports[0]
		if (!port)
			throw new NoPortsError('onconnect fired, but there is no associated port')

		new WorkerPort<MemoryModel, TransitionSchema>({
			port,
			syncEngineDefinition,
			localHandlers,
			initialMemoryModel
		})
	}
}

export const portManager = { init }
export const __testing__do_not_use_this_ever_or_you_will_have_a_terrible_time_and_also_cause_probably_pretty_major_and_significant_bugs_and_we_wouldnt_want_that_would_we__WorkerPort =
	WorkerPort
