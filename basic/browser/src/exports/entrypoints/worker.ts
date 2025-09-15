/// <reference lib="webworker" />

import { WorkerLocalFirst } from '@/helpers/worker_thread'
import type { LocalEngineDefinition } from '@/types/LocalEngineDefinition'
import {
	DownstreamWorkerMessageType,
	type DownstreamWorkerMessage
} from '@/types/internal_messages/DownstreamWorkerMessage'
import {
	UpstreamWorkerMessageType,
	type UpstreamWorkerMessage
} from '@/types/internal_messages/UpstreamWorkerMessage'
import {
	type Transition,
	WorkerDoubleInitError,
	workerDoubleInit
} from '@ground0/shared'

let called = false
/**
 * @deprecated Use the `workerEntrypoint` from [`general.ts`](./general.ts) instead.
 */
export function workerEntrypoint<
	MemoryModel extends object,
	TransitionSchema extends Transition
>({
	engineDef,
	localHandlers,
	initialMemoryModel
}: LocalEngineDefinition<MemoryModel, TransitionSchema>) {
	if (called) throw new WorkerDoubleInitError(workerDoubleInit(false))
	called = true

	const ourObject = new WorkerLocalFirst()

	self.onmessage = (
		event: MessageEvent<UpstreamWorkerMessage<TransitionSchema>>
	) => {
		const message = event.data
		switch (message.type) {
			case UpstreamWorkerMessageType.Init: {
				const { wsUrl, dbName } = message.data
				ourObject.init({
					wsUrl,
					dbName,
					engineDef,
					// @ts-expect-error We can't cover every combination ever. It's, like, the whole point of narrowing our types.
					localHandlers,
					initialMemoryModel,
					announceTransformation(transformation) {
						self.postMessage({
							type: DownstreamWorkerMessageType.Transformation,
							transformation
						} satisfies DownstreamWorkerMessage)
					}
				})
				return
			}
		}
	}
	self.onmessageerror = (e) => {
		console.error('Message error!')
		console.error(e)
	}
}
