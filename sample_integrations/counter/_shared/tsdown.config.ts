import { defineConfig } from 'tsdown'
import sqlRaw from 'vite-plugin-sql-raw'

export default defineConfig({
	exports: true,
	dts: true,
	unbundle: true,
	target: 'esnext',
	platform: 'neutral',
	sourcemap: true,
	entry: {
		index: 'src/index.ts',
		schema: 'src/schema.ts'
	},
	plugins: [sqlRaw()]
})
