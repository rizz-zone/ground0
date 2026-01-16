import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		coverage: {
			provider: 'v8',
			include: [], // Don't measure coverage for sample code
			exclude: ['**/*']
		}
	}
})
