/// <reference lib="webworker" />

import {
	WorkerDoubleInitError,
	workerDoubleInit,
	type Transition
} from '@ground0/shared'
import { portManager } from '@/helpers/port_manager'
import type { LocalEngineDefinition } from '@/types/LocalEngineDefinition'

let called = false
/**
 * @deprecated Use the `workerEntrypoint` from [`general.ts`](./general.ts) instead.
 */
export function sharedWorkerEntrypoint<
	MemoryModel extends object,
	TransitionSchema extends Transition
>(
	effectiveLocalDefinition: LocalEngineDefinition<MemoryModel, TransitionSchema>
) {
	if (called) throw new WorkerDoubleInitError(workerDoubleInit(true))
	called = true

	portManager.init(effectiveLocalDefinition)
}
