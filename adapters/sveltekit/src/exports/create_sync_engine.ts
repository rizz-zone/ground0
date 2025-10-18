import { BrowserLocalFirst } from '@ground0/browser'
import {
	type DownstreamWorkerMessage,
	DownstreamWorkerMessageType
} from '@ground0/browser/adapter_extras'
import type { Transition } from '@ground0/shared'
import { writable } from 'svelte/store'

class ReactiveSyncEngine<T extends Transition, MemoryModel extends object> {
	// TODO: Use a custom store (so that the consumer doesn't .set)
	public memoryModel = writable<MemoryModel | undefined>()
	private browserLocalFirst: BrowserLocalFirst<T, MemoryModel>

	constructor(workerUrl: URL) {
		const input: ConstructorParameters<typeof Worker> = [
			workerUrl,
			{ type: 'module' }
		]
		this.browserLocalFirst = new BrowserLocalFirst(
			'SharedWorker' in globalThis
				? new SharedWorker(...input)
				: new Worker(...input),
			this.onMessage.bind(this)
		)
	}

	onMessage(message: DownstreamWorkerMessage<MemoryModel>) {
		switch (message.type) {
			case DownstreamWorkerMessageType.InitMemoryModel:
				this.memoryModel.set(message.memoryModel)
				return
			case DownstreamWorkerMessageType.Transformation:
		}
	}
	transition(
		...params: Parameters<(typeof this.browserLocalFirst)['transition']>
	) {
		return this.browserLocalFirst.transition(...params)
	}
}

/**
 * Creates a sync engine instance that is reactive in **Svelte**.
 * @param workerUrl A `URL` object that leads to the worker (see example)
 * @example
 * ```
 * const syncEngine = createSyncEngine(new URL('./worker.ts', import.meta.url))
 * ```
 */
export function createSyncEngine(
	...params: ConstructorParameters<typeof ReactiveSyncEngine>
) {
	return new ReactiveSyncEngine(...params)
}
export type { ReactiveSyncEngine }
