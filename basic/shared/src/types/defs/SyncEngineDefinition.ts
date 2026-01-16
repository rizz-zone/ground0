import type { Transition } from '@/types/transitions/Transition'
import type { GeneratedMigrationSchema } from './GeneratedMigrationSchema'
import type { SharedTransitionHandlers } from '../transitions/handling/sets/SharedTransitionHandlers'
import type { Update } from '../updates/Update'

export type SyncEngineDefinition<
	AppTransition extends Transition,
	_AppUpdate extends Update
> = {
	version: {
		// TODO: It's not `version.onTooOld` anymore, this needs to be updated
		/**
		 * The version of the sync engine that this definition provides. This
		 * must be valid in [SemVer format](https://semver.org/) (e.g 1.2.3)
		 * and be greater than the `minimum` version.
		 *
		 * You should set this because it will will signal to the Durable
		 * Object backend whether the client is too old. This will help in case
		 * you release bad code, or do a large backwards-incompatible refactor
		 * of your sync engine.
		 *
		 * On the client side, if you connect to a Durable Object that has a
		 * mismatched [major](https://semver.org/#spec-item-8) version,
		 * `version.onTooOld` will fire.
		 */
		current: string
		/**
		 * The lowest client version that can connect to the Durable Object
		 * backend. **This should usually be unnecessary, because the Durable
		 * Object backend will reject [major](https://semver.org/#spec-item-8)
		 * versions that do not match** &mdash; conforming to the [SemVer
		 * standard](https://semver.org/) is helpful for ensuring you do not
		 * need this option.
		 */
		minimum?: string
	}
	transitions: {
		/**
		 * Transition handlers that can be used on both the client and the
		 * Durable Object backend.
		 */
		sharedHandlers: SharedTransitionHandlers<AppTransition>
	}
	db: {
		migrations: GeneratedMigrationSchema
	}
}
