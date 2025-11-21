/// <reference types="@cloudflare/workers-types" />

import type { Transition } from '@/types/transitions/Transition'
import type { BaseHandlerParams } from '../BaseHandlerParams'
import type { DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite'
import type { UUID } from '@/types/common/UUID'

export type BackendHandlerParams<AppTransition extends Transition> = {
	db: DrizzleSqliteDODatabase
	transitionId: number
	connectionId: UUID
} & BaseHandlerParams<AppTransition>
