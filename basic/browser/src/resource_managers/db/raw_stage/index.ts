import { OPFSCoopSyncVFS } from './vfs'
import { Factory } from 'wa-sqlite'
import { createModule } from './create_module'

export async function getRawSqliteDb({
	pullWasmBinary,
	dbName
}: {
	pullWasmBinary: () => Promise<ArrayBuffer>
	dbName: string
}): Promise<{ sqlite3: SQLiteAPI; db: number }> {
	// Get the wasm with the code of the adapter. It's the adapter's
	// responsibility to do this, including providing a retry method. If it
	// fails, it's fine to push the error upward.
	const module = await createModule(pullWasmBinary)

	// Wrap the module with the JS API.
	const sqlite3 = Factory(module)

	// Register our virtual filesystem and set it as the default immediately.
	const vfs = await OPFSCoopSyncVFS.create('opfs', module)
	sqlite3.vfs_register(vfs as unknown as SQLiteVFS, true)

	// Open the database. db is a pointer to this specific opened db, and must
	// be passed in to methods under sqlite3 so it knows where to apply things.
	const db = await sqlite3.open_v2(dbName)

	return { sqlite3, db }
}
