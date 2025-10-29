// Uncomment to analyse the overall bundle.

import { defineConfig } from 'tsdown'
// import { unstableRolldownAdapter, analyzer } from 'vite-bundle-analyzer'

export default defineConfig({
	exports: true,
	dts: true,
	unbundle: true,
	target: 'esnext',
	platform: 'browser',
	sourcemap: true,
	entry: {
		adapter_extras: 'src/adapter_extras.ts',
		index: 'src/index.ts',
		wasm: 'src/wasm.ts',
		worker: 'src/worker.ts',
		db_nested_worker: 'src/db_nested_worker.ts'
	}
	// ,minify: true,
	// noExternal: [/[\s\S]*/],
	// plugins: [unstableRolldownAdapter(analyzer())]
})
