import type { ArrayPath } from '@/types/path_stores/ArrayPath'
import type { StringPath } from '@/types/path_stores/StringPath'
import { BrowserLocalFirst } from '@ground0/browser'
import {
	type DownstreamWorkerMessage,
	DownstreamWorkerMessageType
} from '@ground0/browser/adapter_extras'
import type { Transition } from '@ground0/shared'
import { onDestroy } from 'svelte'
import { readonly, writable, type Readable } from 'svelte/store'
import type { PathValue } from '@/types/path_values/PathValue'
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

	private pathSubscriptions = new Map<
		string,
		Map<
			symbol,
			(newValue: PathValue<MemoryModel, never> | undefined) => unknown
		>
	>()

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

		const pathString = JSON.stringify(properPath)

		return {
			subscribe: (
				update: (newValue: PathValue<MemoryModel, Path> | undefined) => unknown
			) => {
				const subscriptionId = Symbol()
				let subscriptionFnMap = this.pathSubscriptions.get(pathString)
				if (!subscriptionFnMap) {
					subscriptionFnMap = new Map()
					this.pathSubscriptions.set(pathString, subscriptionFnMap)
				}
				subscriptionFnMap.set(
					subscriptionId,
					update as unknown as (
						newValue: PathValue<MemoryModel, never> | undefined
					) => unknown
				)
				// TODO: call update for the first time
				return () => subscriptionFnMap.delete(subscriptionId)
			}
		}
	}

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
export function createSyncEngine<
	T extends Transition,
	MemoryModel extends object
>(...params: ConstructorParameters<typeof ReactiveSyncEngine>) {
	return new ReactiveSyncEngine<T, MemoryModel>(...params)
}
export type { ReactiveSyncEngine }
