import type { ArrayPath } from '@/types/path_stores/ArrayPath'
import type { StringPath } from '@/types/path_stores/StringPath'
import { BrowserLocalFirst } from '@ground0/browser'
import {
	type DownstreamWorkerMessage,
	DownstreamWorkerMessageType
} from '@ground0/browser/adapter_extras'
import type { Transition } from '@ground0/shared'
import { onDestroy } from 'svelte'
import { readonly, type Readable } from 'svelte/store'
import type { PathValue } from '@/types/path_stores/values/PathValue'
import { MemoryModelStore } from '@/stores/memory_model'
import { PathStoreTree } from '@/stores/path_store_tree'

class ReactiveSyncEngine<T extends Transition, MemoryModel extends object> {
	private editableMemoryModel = new MemoryModelStore<MemoryModel>()
	public memoryModel = readonly(this.editableMemoryModel)
	private browserLocalFirst?: BrowserLocalFirst<T, MemoryModel>

	constructor(workerUrl: URL) {
		const input: ConstructorParameters<typeof Worker> = [
			workerUrl,
			{ type: 'module' }
		]

		this.browserLocalFirst =
			'Worker' in globalThis
				? new BrowserLocalFirst(
						'SharedWorker' in globalThis
							? new SharedWorker(...input)
							: new Worker(...input),
						this.onMessage.bind(this)
					)
				: undefined

		onDestroy(this[Symbol.dispose].bind(this))
	}

	private storeTree = new PathStoreTree()

	public path<
		Path extends StringPath<MemoryModel> | Readonly<ArrayPath<MemoryModel>>
	>(path: Path): Readable<PathValue<MemoryModel, Path> | undefined> {
		let properPath: string[]
		switch (typeof path) {
			case 'string':
				properPath = path.split('.')
				break
			// @ts-expect-error We want a fallthrough case here
			case 'object':
				if (Array.isArray(path)) {
					properPath = path.map((item) =>
						typeof item === 'string' ? item : String(item)
					)
					break
				}
			// eslint-disable-next-line no-fallthrough
			default:
				// TODO: Make this error more good
				throw new Error()
		}

		// TODO: Make this error more good too
		if (properPath.length <= 0) throw new Error()
		const finalPath = properPath as unknown as Parameters<
			PathStoreTree['createPathSubscriber']
		>[0]

		return {
			subscribe: (
				update: (newValue: PathValue<MemoryModel, Path> | undefined) => unknown
			) => {
				const subscription = this.storeTree.createPathSubscriber(
					finalPath,
					update,
					this.memoryModel as unknown as { [key: string | number]: unknown }
				)
				return () =>
					this.storeTree.deletePathSubscriber(finalPath, subscription)
			}
		}
	}

	private onMessage(message: DownstreamWorkerMessage<MemoryModel>) {
		switch (message.type) {
			case DownstreamWorkerMessageType.InitMemoryModel:
				this.editableMemoryModel.currentValue = message.memoryModel
				return
			case DownstreamWorkerMessageType.Transformation:
		}
	}
	public transition(
		...params: Parameters<
			NonNullable<typeof this.browserLocalFirst>['transition']
		>
	) {
		return this.browserLocalFirst?.transition(...params)
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
export function createSyncEngine<
	T extends Transition,
	MemoryModel extends object
>(...params: ConstructorParameters<typeof ReactiveSyncEngine>) {
	return new ReactiveSyncEngine<T, MemoryModel>(...params)
}
export type { ReactiveSyncEngine }
