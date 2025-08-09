/// <reference lib="webworker" />

import { createActor } from 'xstate'
import { clientMachine } from '@/machines/worker'

export class WorkerLocalFirst {
	private machine

	constructor() {
		this.machine = createActor(clientMachine)
		this.machine.start()
	}

	init({ wsUrl, dbName }: { wsUrl: string; dbName: string }) {
		this.machine.send({ type: 'init', wsUrl, dbName })
	}

	public [Symbol.dispose] = () => {
		this.machine.stop()
	}
}
