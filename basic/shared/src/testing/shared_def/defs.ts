import type { SyncEngineDefinition } from '@/types/defs/SyncEngineDefinition'
import {
	testingTransitionSchema,
	type TestingTransition
} from '../type_defs/transitions'
import migrations from './drizzle/migrations'

export const defs: SyncEngineDefinition<TestingTransition> = {
	version: {
		current: '1.0.0'
	},
	transitions: {
		schema: testingTransitionSchema,
		sharedHandlers: {
			3: () => {}
		}
	},
	db: { migrations }
}
