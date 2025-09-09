// @ts-expect-error wa-sqlite has no type definitions
import { OPFSCoopSyncVFS } from 'wa-sqlite/src/examples/OPFSCoopSyncVFS.js'
// @ts-expect-error wa-sqlite has no type definitions
import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'
// @ts-expect-error wa-sqlite has no type definitions
import * as SQLite from 'wa-sqlite/src/sqlite-api.js'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { brandedLog } from '@/common/branded_log'

export class DbResourceManager {
	private syncResources
	private dbName
	public constructor({
		syncResources,
		dbName
	}: {
		syncResources: (modifications: Partial<ResourceBundle>) => unknown
		dbName: string
	}) {
		this.syncResources = syncResources
		this.dbName = dbName
	}

	private async connectDb(pullWasmBinary: () => Promise<ArrayBuffer>) {
		// Get the wasm with the code of the adapter. It's the adapter's
		// responsibility to do this, including providing a retry method
		const module = await pullWasmBinary().then(
			(wasm) =>
				SQLiteESMFactory({
					instantiateWasm: (
						imports: WebAssembly.Imports,
						successCallback: (instance: WebAssembly.Instance) => void
					) => {
						WebAssembly.instantiate(wasm, imports).then(({ instance }) => {
							successCallback(instance)
						})
						return {} // emscripten requires this return
					}
				}),
			() => {
				this.syncResources({ db: { status: DbResourceStatus.NeverConnecting } })
			}
		)
		// The module will be undefined if onrejected was called
		if (typeof module === 'undefined') return

		const sqlite3 = SQLite.Factory(module)

		// Register a custom file system.
		const vfs = await OPFSCoopSyncVFS.create('opfs', module)
		sqlite3.vfs_register(vfs, true)

		// Open the database.
		const db = await sqlite3.open_v2(this.dbName) // NOTE TO SELF: THIS IS A POINTER

		// TODO: Use our own errors instead of these ones for Clarity

		let pageSize: number | undefined
		if (
			(await sqlite3.exec(db, `PRAGMA page_size;`, (row: number[]) => {
				pageSize = row[0]
			})) !== SQLite.SQLITE_OK
		)
			throw new Error('Could not get page size')
		let pageCount: number | undefined
		if (
			(await sqlite3.exec(db, `PRAGMA page_count;`, (row: number[]) => {
				pageCount = row[0]
			})) !== SQLite.SQLITE_OK
		)
			throw new Error('Could not get page count')
		if (typeof pageSize === 'undefined' || typeof pageCount === 'undefined')
			throw new Error('SQLite is not reporting storage')

		const { quota } = await navigator.storage.estimate()
		if (!quota) throw new Error('Browser is not reporting storage quota')
		brandedLog(
			console.debug,
			`${this.dbName} is using ${pageSize * pageCount}B (${quota}B available - ${Math.floor((pageSize * pageCount) / quota)}% used)`
		)

		// Set a page limit so that the database doesn't exceed available
		// quota. We'll use 90% of the available quota as a safety margin.
		const maxBytes = Math.floor(quota * 0.9)
		const maxPages = Math.floor(maxBytes / pageSize)
		const setPageLimitResult = await sqlite3.exec(
			db,
			`PRAGMA max_page_count = ${maxPages};`
		)
		if (setPageLimitResult !== SQLite.SQLITE_OK) {
			throw new Error('Could not set max_page_count')
		}
		brandedLog(
			console.debug,
			`Set max_page_count to ${maxPages} (~${maxBytes}B)`
		)

		// TODO: Turn this into a drizzle db. This code from the cloneathon
		// will come in handy:
		// https://github.com/ezShroom/rizz-chat/blob/17f6fc962e65642c6a04e8c273be0f16cf99474d/packages/sveltekit/src/lib/sync_layer/workers/backend/storage/index.ts#L135-L163
	}
}
