import { BrowserLocalFirst } from '@ground0/browser'
import type { TransitionSchema } from '@ground0/shared'

/**
 * Creates a sync engine instance that is reactive in **Svelte**.
 * @param workerUrl A `URL` object that leads to the worker (see example)
 * @example
 * ```
 * const syncEngine = createSyncEngine(new URL('./worker.ts', import.meta.url))
 * ```
 */
export class ReactiveSyncEngine<T extends TransitionSchema, MemoryModel extends object> {
    constructor(workerUrl: URL) {

    }
}
export function createSyncEngine() {
	const input: ConstructorParameters<typeof Worker> = [
		workerUrl,
		{ type: 'module' }
	]
	const worker =
		'SharedWorker' in globalThis
			? new SharedWorker(...input)
			: new Worker(...input)
    const onMessage = 
	const browserLocalFirst = new BrowserLocalFirst(worker)
}
