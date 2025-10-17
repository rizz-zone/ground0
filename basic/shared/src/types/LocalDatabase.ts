import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'

export type LocalDatabase = SqliteRemoteDatabase<Record<string, never>>
