import { BrowserLocalFirst } from '@ground0/browser'

export function createSyncEngine(workerUrl: string) {
	const input: ConstructorParameters<typeof Worker> = [
		new URL(workerUrl, import.meta.url),
		{ type: 'module' }
	]
	const worker =
		'SharedWorker' in globalThis
			? new SharedWorker(...input)
			: new Worker(...input)
	const browserLocalFirst = new BrowserLocalFirst(worker)
}
