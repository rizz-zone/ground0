/// <reference lib="webworker" />

import { createActor } from 'xstate'
import { clientMachine } from '@/machines/worker'
import type {
	LocalHandlers,
	SyncEngineDefinition,
	Transition
} from '@ground0/shared'
import type { Transformation } from '@/types/memory_model/Tranformation'

export class WorkerLocalFirst<
	MemoryModel extends object,
	TransitionSchema extends Transition
> {
	private machine

	constructor() {
		this.machine = createActor(clientMachine)
		this.machine.start()
	}

	init({
		wsUrl,
		dbName,
		engineDef,
		localHandlers,
		initialMemoryModel,
		announceTransformation
	}: {
		wsUrl: string
		dbName: string
		engineDef: SyncEngineDefinition<TransitionSchema>
		localHandlers: LocalHandlers<MemoryModel, TransitionSchema>
		initialMemoryModel: MemoryModel
		announceTransformation: (transformation: Transformation) => unknown
	}) {
		this.machine.send({
			type: 'init',
			wsUrl,
			dbName,
			engineDef,
			// @ts-expect-error We can't cover every combination ever. It's, like, the whole point of narrowing our types.
			localHandlers,
			initialMemoryModel,
			announceTransformation
		})
	}

	public [Symbol.dispose] = () => {
		this.machine.stop()
	}
}
