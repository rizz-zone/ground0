import { SyncEngineBackend } from '@/durable_object'
import {
	type TestingTransition,
	type TestingUpdate,
	defs,
	testingTransitionSchema
} from '@ground0/shared/testing'

export class SampleObject extends SyncEngineBackend<
	TestingTransition,
	TestingUpdate
> {
	protected override engineDef = defs
	protected override backendHandlers = {
		3: {
			confirm: () => true
		}
	}
	protected override appTransitionSchema = testingTransitionSchema
}
