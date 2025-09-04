/// <reference lib="webworker" />

import {
	WorkerDoubleInitError,
	workerDoubleInit,
	type Transition
} from '@ground0/shared'
import { portManager } from '@/helpers/port_manager'
import type { EffectiveLocalDefinition } from '@/types/EffectiveLocalDefinition'

let called = false

export function sharedWorkerEntrypoint<
	MemoryModel extends object,
	TransitionSchema extends Transition
>(
	effectiveLocalDefinition: EffectiveLocalDefinition<
		MemoryModel,
		TransitionSchema
	>
) {
	if (called) throw new WorkerDoubleInitError(workerDoubleInit(true))
	called = true

	portManager.init(effectiveLocalDefinition)
}
