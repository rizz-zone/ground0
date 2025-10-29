import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'

export function createModule(wasmBinary: ArrayBuffer) {
	return SQLiteESMFactory({
		instantiateWasm: (
			imports: WebAssembly.Imports,
			successCallback: (instance: WebAssembly.Instance) => void
		) => {
			WebAssembly.instantiate(wasmBinary, imports).then(({ instance }) => {
				successCallback(instance)
			})
			return {} // emscripten requires this return
		}
	})
}
