import { configDefaults } from 'vitest/config'
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config'
import tsconfigPaths from 'vite-tsconfig-paths'

// @ts-expect-error The plugin is definitely fine, it's just disliked in this community for some reason
export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				/*miniflare: {
					compatibilityDate: '2025-07-01'
				}*/
				wrangler: { configPath: './src/testing/sample_wrangler.jsonc' }
			}
		},
		exclude: [...configDefaults.exclude, '**/*.config.ts'],
		coverage: {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			exclude: [...configDefaults.coverage.exclude!, '**/*.config.ts'],
			reporter: ['lcov', 'text'],
			provider: 'istanbul'
		},
		globals: true
	},
	plugins: [tsconfigPaths()]
})
