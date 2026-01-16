import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		exclude: [...configDefaults.exclude, '**/*.config.ts'],
		coverage: {
			exclude: [
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				...configDefaults.coverage.exclude!,
				'**/*.config.ts'
			],
			reporter: ['lcov', 'text']
		},
		globals: true
	}
})
