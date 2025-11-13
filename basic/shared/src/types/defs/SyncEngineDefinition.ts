import type { Transition } from '@/types/transitions/Transition'
import type { TransitionSchema } from '@/types/transitions/TransitionSchema'
import type { GeneratedMigrationSchema } from './GeneratedMigrationSchema'
import type { SharedTransitionHandlers } from '../transitions/handling/sets/SharedTransitionHandlers'

export type SyncEngineDefinition<T extends Transition> = {
	version: {
		/**
		 * The version of the sync engine that this definition provides. This must be valid in [SemVer format](https://semver.org/) (e.g 1.2.3) and be greater than the `minimum` version.
		 *
		 * You should set this because it will will signal to the Durable Object whether the client is too old. This will help in case you release bad code, or do a large backwards-incompatible refactor of your sync engine.
		 *
		 * On the client side, if you connect to a Durable Object that has a mismatched MAJOR version, `version.onTooOld` will fire.
		 */
		current: string
		minimum?: string
	}
	transitions: {
		/**
		 * The transition schema for this sync enigne.
		 */
		schema: TransitionSchema<T>
		sharedHandlers: SharedTransitionHandlers<T>
	}
	db: {
		migrations: GeneratedMigrationSchema
	}
}
