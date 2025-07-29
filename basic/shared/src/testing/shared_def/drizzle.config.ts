import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	dialect: 'sqlite',
	schema: './src/testing/shared_def/schema.ts',
	out: './src/testing/shared_def/drizzle',
	driver: 'durable-sqlite'
})
