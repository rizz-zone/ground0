import type { AppTransition, MemoryModel } from '$lib/sync_engine/types'
import { createSyncEngine } from '@ground0/adapter-svelte'
import { wasmUrl } from 'ground0/wasm'
import { fetchWasmFromUrl } from 'ground0'

export const engine = createSyncEngine<AppTransition, MemoryModel>({
	workerUrl: new URL('./worker.ts', import.meta.url),
	dbWorkerUrl: new URL('./db_worker.ts', import.meta.url),
	pullWasmBinary: fetchWasmFromUrl(wasmUrl)
})
