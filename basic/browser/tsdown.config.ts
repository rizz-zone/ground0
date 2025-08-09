import { defineConfig } from 'tsdown'

export default defineConfig({
	exports: true,
	dts: true,
	unbundle: true,
	target: 'esnext',
	platform: 'browser',
	sourcemap: true,
	entry: {
		index: 'src/index.ts'
	}
})
