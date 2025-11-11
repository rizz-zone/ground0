import type { SyncEngineDefinition } from 'ground0'
import { appTransitionSchema, type AppTransition } from './types'
import migrations from '@/db/generated/migrations.js'

export const engineDef = {
	version: {
		current: '0.0.1'
	},
	transitions: {
		schema: appTransitionSchema,
		sharedHandlers: {}
	},
	db: {
		migrations
	}
} satisfies SyncEngineDefinition<AppTransition>
