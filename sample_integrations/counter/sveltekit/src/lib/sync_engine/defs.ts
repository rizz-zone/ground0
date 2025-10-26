import type { SyncEngineDefinition } from 'ground0'
import { appTransitionSchema, type AppTransition } from './types'

export const globalEngineDefinition = {
	version: {
		current: '0.0.1'
	},
	transitions: {
		schema: appTransitionSchema,
		sharedHandlers: {}
	},
	db: {
		migrations: {}
	}
} satisfies SyncEngineDefinition<AppTransition>
