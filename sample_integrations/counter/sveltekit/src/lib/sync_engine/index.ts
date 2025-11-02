import type { AppTransition, MemoryModel } from '$lib/sync_engine/types'
import { createSyncEngine } from '@ground0/adapter-svelte'
import { wasmUrl } from 'ground0/wasm'
import { fetchWasmFromUrl } from 'ground0'

// This double wrapping of URL, with the outer layer being called 'Worker', is
// a workaround for a Vite issue: https://github.com/vitejs/vite/issues/11823
//
// Because .ts is more traditionally a container format for MPEG-TS, Vite will
// assume that MIME type instead of TypeScript in all cases, except when the
// URL is wrapped inside of a constructor named Worker or SharedWorker.

const Worker = URL
export const engine = createSyncEngine<AppTransition, MemoryModel>({
	workerUrl: new Worker(new URL('./worker.ts', import.meta.url)),
	dbWorkerUrl: new Worker(new URL('./db_worker.ts', import.meta.url)),
	pullWasmBinary: fetchWasmFromUrl(wasmUrl)
})
