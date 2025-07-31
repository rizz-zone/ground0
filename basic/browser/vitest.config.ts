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
				'**/testing/**'
			],
			reporter: ['lcov', 'text']
		},
		globals: true,
		environment: 'jsdom'
	},
	// @ts-expect-error There's some kind of type conflict but the plugin definitely works
	plugins: [tsconfigPaths()]
})
