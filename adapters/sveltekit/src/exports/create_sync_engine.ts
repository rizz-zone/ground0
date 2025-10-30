import type { ArrayPath } from '@/types/path_stores/ArrayPath'
import type { StringPath } from '@/types/path_stores/StringPath'
import type { PathValue } from '@/types/path_stores/values/PathValue'
import { BrowserLocalFirst } from '@ground0/browser'
import {
	type DownstreamWorkerMessage,
	DownstreamWorkerMessageType
} from '@ground0/browser/adapter_extras'
import type { Transition } from '@ground0/shared'
import { onDestroy } from 'svelte'
import { readonly, type Readable } from 'svelte/store'
import { MemoryModelStore } from '@/stores/memory_model'
import { PathStoreTree } from '@/stores/path_store_tree'

class ReactiveSyncEngine<T extends Transition, MemoryModel extends object> {
	private editableMemoryModel = new MemoryModelStore<MemoryModel>()
	public memoryModel = readonly(this.editableMemoryModel)
	private browserLocalFirst?: BrowserLocalFirst<T, MemoryModel>

	constructor({
		workerUrl,
		dbWorkerUrl
	}: {
		workerUrl: URL
		dbWorkerUrl: URL
	}) {
		this.browserLocalFirst =
			'Worker' in globalThis
				? new BrowserLocalFirst({
						worker:
							'SharedWorker' in globalThis
								? new SharedWorker(workerUrl, { type: 'module' })
								: new Worker(workerUrl, { type: 'module' }),
						onMessage: this.onMessage.bind(this),
						dbWorker: new Worker(dbWorkerUrl)
					})
				: undefined

		onDestroy(this[Symbol.dispose].bind(this))
	}

	private storeTree = new PathStoreTree()

	public path<
		Path extends StringPath<MemoryModel> | Readonly<ArrayPath<MemoryModel>>
	>(
		path: Path
	): Readable<
		Path extends string
			? PathValue<MemoryModel, Path> | undefined
			: Path extends readonly (string | number)[]
				? PathValue<MemoryModel, Path> | undefined
				: never
	> {
		let properPath: string[]
		if (typeof path === 'string') {
			properPath = path.split('.')
		} else if (Array.isArray(path)) {
			properPath = path.map((item) =>
				typeof item === 'string' ? item : String(item)
			)
		} else {
			// TODO: Make this error more good
			throw new Error()
		}

		// TODO: Make this error more good too
		if (properPath.length <= 0) throw new Error()
		const finalPath = properPath as unknown as Parameters<
			PathStoreTree['createPathSubscriber']
		>[0]

		return {
			subscribe: (update: (newValue: unknown) => unknown) => {
				const subscription = this.storeTree.createPathSubscriber(
					finalPath,
					update,
					this.memoryModel as unknown as { [key: string | number]: unknown }
				)
				return () =>
					this.storeTree.deletePathSubscriber(finalPath, subscription)
			}
		} as Readable<
			Path extends string
				? PathValue<MemoryModel, Path> | undefined
				: Path extends readonly (string | number)[]
					? PathValue<MemoryModel, Path> | undefined
					: never
		>
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
 * ```ts
 * const syncEngine = createSyncEngine<AppTransition, MemoryModel>({
 * 	workerUrl: new URL('./worker.ts', import.meta.url),
 * 	dbWorkerUrl: new URL('./db_worker.ts', import.meta.url)
 * })
 * ```
 */
export function createSyncEngine<
	T extends Transition = never,
	MemoryModel extends object = never
>(
	...params: ConstructorParameters<typeof ReactiveSyncEngine>
): T extends never
	? never
	: MemoryModel extends never
		? never
		: ReactiveSyncEngine<T, MemoryModel> {
	return new ReactiveSyncEngine<T, MemoryModel>(...params) as T extends never
		? never
		: MemoryModel extends never
			? never
			: ReactiveSyncEngine<T, MemoryModel>
}
export type { ReactiveSyncEngine }
