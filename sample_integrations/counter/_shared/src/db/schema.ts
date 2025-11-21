import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'

export const counter = sqliteTable('counter', () => ({
	id: integer().primaryKey(),
	value: integer().notNull()
}))
