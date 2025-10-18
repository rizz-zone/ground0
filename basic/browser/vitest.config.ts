import { configDefaults, defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, '**/*.config.ts'],
		coverage: {
			exclude: [
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				...configDefaults.coverage.exclude!,
				'**/*.config.ts',
				'**/testing/**',
				'src/resource_managers/db/raw_stage/vfs/*.js'
			],
			reporter: ['lcov', 'text']
		},
		globals: true,
		environment: 'jsdom'
	},
	plugins: [tsconfigPaths()]
})
