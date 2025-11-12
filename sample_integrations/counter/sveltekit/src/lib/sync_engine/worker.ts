import { type MemoryModel } from './MemoryModel'
import { workerEntrypoint } from 'ground0/worker'
import {
	engineDef,
	TransitionAction,
	type AppTransition
} from '@ground0/sample-counter-shared'

let wsUrl: string
try {
	wsUrl = __WS_URL__
} catch {
	wsUrl = 'ws://localhost:8787/ws'
}

workerEntrypoint<MemoryModel, AppTransition>({
	engineDef,
	initialMemoryModel: {
		counter: 0
	},
	localHandlers: {
		[TransitionAction.Increment]: {
			editMemoryModel: ({ memoryModel }) => {
				memoryModel.counter++
			},
			revertMemoryModel: ({ memoryModel }) => {
				memoryModel.counter--
			}
		},
		[TransitionAction.LocalIncrement]: {
			editMemoryModel: ({ memoryModel }) => {
				memoryModel.counter++
			}
		}
	},
	wsUrl,
	dbName: 'counter'
})
