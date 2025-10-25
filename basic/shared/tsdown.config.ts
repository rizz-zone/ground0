import { defineConfig } from 'tsdown'
import { type PluginOption } from 'vite'

const sqlRawPlugin: PluginOption = {
	name: 'vite-plugin-sql-raw',
	enforce: 'pre',
	transform(code, id) {
		if (id.endsWith('.sql')) {
			return `export default \`${code.replaceAll('`', '\\`')}\`;`
		}
	}
}

export default defineConfig({
	exports: true,
	dts: true,
	unbundle: true,
	target: 'es2021',
	platform: 'neutral',
	sourcemap: true,
	entry: {
		index: 'src/index.ts',
		zod: 'src/zod.ts'
	},
	plugins: [sqlRawPlugin]
})
