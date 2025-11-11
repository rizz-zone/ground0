import { type AppTransition, type MemoryModel } from '$lib/sync_engine/types'
import { createSyncEngine } from '@ground0/adapter-svelte'
import { wasmUrl } from 'ground0/wasm'
import { fetchWasmFromUrl } from 'ground0'
import { dev } from '$app/environment'

// This double wrapping of URL, with the outer layer being called 'Worker', is
// a workaround for a Vite issue: https://github.com/vitejs/vite/issues/11823
//
// Because .ts is more traditionally a container format for MPEG-TS, Vite will
// assume that MIME type instead of TypeScript in all cases, except when the
// URL is wrapped inside of a constructor named Worker or SharedWorker.
//
// However, dev mode requires that we do things normally, so we have to
// take a different path with the dev server than we do with prod. Really one
// of the workarounds of all time.

const Worker = URL
export const engine = createSyncEngine<AppTransition, MemoryModel>({
	workerUrl: dev
		? new URL('./worker.ts', import.meta.url)
		: new Worker(new URL('./worker.ts', import.meta.url)),
	dbWorkerUrl: dev
		? new URL('./db_worker.ts', import.meta.url)
		: new Worker(new URL('./db_worker.ts', import.meta.url)),
	pullWasmBinary: fetchWasmFromUrl(wasmUrl)
})
