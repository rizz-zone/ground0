import { type MemoryModel } from './MemoryModel'
import { workerEntrypoint } from 'ground0/worker'
import {
	engineDef,
	TransitionAction,
	UpdateAction,
	type AppTransition,
	type AppUpdate
} from '@ground0/sample-counter-shared'

let wsUrl: string
try {
	wsUrl = __WS_URL__
} catch {
	wsUrl = 'ws://localhost:8787/ws'
}

workerEntrypoint<MemoryModel, AppTransition, AppUpdate>({
	engineDef,
	initialMemoryModel: {
		counter: 0
	},
	localTransitionHandlers: {
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
	updateHandlers: {
		[UpdateAction.InitialValue]: ({ memoryModel, data }) => {
			memoryModel.counter = data.value
		},
		[UpdateAction.Increment]: ({ memoryModel }) => {
			memoryModel.counter++
		}
	},
	wsUrl,
	dbName: 'counter'
})
