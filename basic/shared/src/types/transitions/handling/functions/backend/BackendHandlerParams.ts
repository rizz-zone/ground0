/// <reference types="@cloudflare/workers-types" />

import type { Transition } from '@/types/transitions/Transition'
import type { BaseHandlerParams } from '../BaseHandlerParams'
import type { DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite'

export type BackendHandlerParams<AppTransition extends Transition> = {
	db: DrizzleSqliteDODatabase
	transitionId: number
	rawSocket: WebSocket
	connectionId: string
} & BaseHandlerParams<AppTransition>
