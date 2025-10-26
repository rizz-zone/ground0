import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	dialect: 'sqlite',
	driver: 'durable-sqlite',
	schema: './src/lib/sync_engine/db/schema.ts',
	out: './src/lib/sync_engine/db/generated'
})
