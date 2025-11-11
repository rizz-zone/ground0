import { SyncEngineBackend } from '@ground0/durable-object'
import {
	engineDef,
	TransitionAction,
	type AppTransition
} from '@ground0/sample-counter-shared'

export class SyncEngineDO extends SyncEngineBackend<AppTransition> {
	protected override engineDef = engineDef
	protected override backendHandlers = {
		[TransitionAction.Increment]: {
			confirm: () => true
		}
	}
}
