import { BrowserLocalFirst } from '@ground0/browser'

/**
 * Creates a reactive sync engine instance that is reactive in **Svelte**.
 * @param workerUrl A `URL` object that leads to the worker (see example)
 * @example
 * ```
 * const syncEngine = createSyncEngine(new URL('./worker.ts', import.meta.url))
 * ```
 */
export function createSyncEngine(workerUrl: URL) {
	const input: ConstructorParameters<typeof Worker> = [
		workerUrl,
		{ type: 'module' }
	]
	const worker =
		'SharedWorker' in globalThis
			? new SharedWorker(...input)
			: new Worker(...input)
	const browserLocalFirst = new BrowserLocalFirst(worker)
}
