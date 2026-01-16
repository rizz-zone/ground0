import { configDefaults } from 'vitest/config'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './src/testing/sample_wrangler.jsonc' }
			}
		},
		exclude: [...configDefaults.exclude, '**/*.config.ts'],
		coverage: {
			exclude: [
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				...configDefaults.coverage.exclude!,
				'**/*.config.ts',
				'**/testing/**'
			],
			reporter: ['lcov', 'text'],
			provider: 'istanbul'
		},
		globals: true
	},
	plugins: [tsconfigPaths()]
})
