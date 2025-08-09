import { SyncEngineBackend } from '@/durable_object'
import { type TestingTransition, defs } from '@ground0/shared'

export class SampleObject extends SyncEngineBackend<TestingTransition> {
	protected override engineDef = defs
	protected override backendHandlers = {
		3: {
			confirm: () => true
		}
	}
}
