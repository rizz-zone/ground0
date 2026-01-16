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
				// Re-export entry points (no executable code)
				'src/index.ts',
				'src/zod.ts',
				'src/testing.ts',
				// Type-only files (no executable code)
				'src/errors/**',
				'src/types/**/*.ts'
			],
			reporter: ['lcov', 'text']
		},
		globals: true
	},
	plugins: [tsconfigPaths()]
})
