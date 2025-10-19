import type { StringPath } from '@/types/path_stores/StringPath'
import { BrowserLocalFirst } from '@ground0/browser'
import {
	type DownstreamWorkerMessage,
	DownstreamWorkerMessageType
} from '@ground0/browser/adapter_extras'
import type { Transition } from '@ground0/shared'
import { onDestroy } from 'svelte'
import { readonly, writable } from 'svelte/store'

class ReactiveSyncEngine<T extends Transition, MemoryModel extends object> {
	private editableMemoryModel = writable<MemoryModel | undefined>()
	public memoryModel = readonly(this.editableMemoryModel)
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

		onDestroy(this[Symbol.dispose].bind(this))
	}

	public path(path: StringPath<MemoryModel>) {}

	private onMessage(message: DownstreamWorkerMessage<MemoryModel>) {
		switch (message.type) {
			case DownstreamWorkerMessageType.InitMemoryModel:
				this.editableMemoryModel.set(message.memoryModel)
				return
			case DownstreamWorkerMessageType.Transformation:
		}
	}
	public transition(
		...params: Parameters<(typeof this.browserLocalFirst)['transition']>
	) {
		return this.browserLocalFirst.transition(...params)
	}

	[Symbol.dispose]() {
		// TODO: Make this
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
