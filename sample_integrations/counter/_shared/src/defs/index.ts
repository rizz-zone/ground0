import type { SyncEngineDefinition } from 'ground0'
import { type AppTransition, type AppUpdate } from './types'
import migrations from '@/db/generated/migrations.js'

export const engineDef = {
	version: {
		current: '0.0.1'
	},
	transitions: {
		sharedHandlers: {}
	},
	db: {
		migrations
	}
} satisfies SyncEngineDefinition<AppTransition, AppUpdate>
