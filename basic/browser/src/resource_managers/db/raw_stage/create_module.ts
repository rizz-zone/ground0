import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite.mjs'

export function createModule(pullWasmBinary: () => Promise<ArrayBuffer>) {
	return pullWasmBinary().then((wasm) =>
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
		})
	)
}
