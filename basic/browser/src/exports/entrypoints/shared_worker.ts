/// <reference lib="webworker" />

import { WorkerDoubleInitError, workerDoubleInit } from '@ground0/shared'
import type { Transition } from '@ground0/shared'
import { portManager } from '@/helpers/port_manager'

let called = false
export function sharedWorkerEntrypoint<TransitionSchema extends Transition>() {
	if (called) throw new WorkerDoubleInitError(workerDoubleInit(true))
	called = true
	portManager.init<TransitionSchema>()
}
