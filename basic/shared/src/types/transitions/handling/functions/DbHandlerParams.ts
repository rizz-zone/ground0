import type { Transition } from '@/types/transitions/Transition'
import type { BaseHandlerParams } from './BaseHandlerParams'
import type { DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite'
import type { LocalDatabase } from '@/types/LocalDatabase'

export type DbHandlerParams<T extends Transition> = {
	db: LocalDatabase | DrizzleSqliteDODatabase
} & BaseHandlerParams<T>
