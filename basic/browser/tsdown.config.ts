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
		index: 'src/index.ts',
		adapter_extras: 'src/adapter_extras.ts',
		worker: 'src/worker.ts'
	}
	// ,minify: true,
	// noExternal: [/[\s\S]*/],
	// plugins: [unstableRolldownAdapter(analyzer())]
})
