/// <reference lib="webworker" />

import { WorkerDoubleInitError, workerDoubleInit } from '@ground0/shared'
import type {
	LocalHandlers,
	SyncEngineDefinition,
	Transition
} from '@ground0/shared'
import { portManager } from '@/helpers/port_manager'

let called = false

export function sharedWorkerEntrypoint<
	MemoryModel extends object,
	TransitionSchema extends Transition
>(effectiveLocalDefinition: {
	syncEngineDefinition: SyncEngineDefinition<TransitionSchema>
	localHandlers: LocalHandlers<MemoryModel, TransitionSchema>
	initialMemoryModel: MemoryModel
}) {
	if (called) throw new WorkerDoubleInitError(workerDoubleInit(true))
	called = true

	portManager.init<MemoryModel, TransitionSchema>(effectiveLocalDefinition)
}
