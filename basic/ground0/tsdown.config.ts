import { defineConfig } from 'tsdown'

export default defineConfig({
	exports: true,
	dts: true,
	unbundle: true,
	target: 'esnext',
	platform: 'neutral',
	sourcemap: true,
	entry: {
		index: 'src/index.ts',
		worker: 'src/worker.ts',
		durable_object: 'src/durable_object.ts'
	}
})
