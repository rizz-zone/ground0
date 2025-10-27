import { defineConfig } from 'tsdown'

export default defineConfig({
	exports: true,
	dts: true,
	unbundle: true,
	target: 'esnext',
	platform: 'neutral',
	sourcemap: true,
	entry: {
		durable_object: 'src/durable_object.ts',
		index: 'src/index.ts',
		wasm: 'src/wasm.ts',
		worker: 'src/worker.ts'
	}
})
