import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'

export const counter = sqliteTable('counter', () => ({
	id: integer().primaryKey().notNull().default(0),
	value: integer().notNull()
}))
