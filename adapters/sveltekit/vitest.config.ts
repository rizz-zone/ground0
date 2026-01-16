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
				// Type-only files (no executable code)
				'src/types/**/*.ts',
				// Browser-specific integration code requiring Worker support
				'src/exports/create_sync_engine.ts'
			],
			reporter: ['lcov', 'text']
		},
		globals: true,
		environment: 'jsdom'
	},
	plugins: [tsconfigPaths()]
})
