import { workerEntrypoint } from 'ground0/worker'
import { engineDef } from './defs'
import { TransitionAction, type AppTransition, type MemoryModel } from './types'

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
		}
	},
	pullWasmBinary: () => {},
	wsUrl: '',
	dbName: ''
})
