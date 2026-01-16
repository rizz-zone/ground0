import type { SyncEngineDefinition } from '@/types/defs/SyncEngineDefinition'
import { type TestingTransition } from '../type_defs/transitions'
import migrations from './drizzle/migrations'
import type { TestingUpdate } from '@/testing'

export const defs: SyncEngineDefinition<TestingTransition, TestingUpdate> = {
	version: {
		current: '1.0.0'
	},
	transitions: {
		sharedHandlers: {
			3: () => {}
		}
	},
	db: { migrations }
}
