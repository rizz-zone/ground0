import { TransitionAction, type AppTransition, type MemoryModel } from './types'
import { workerEntrypoint } from 'ground0/worker'
import { wasmUrl } from 'ground0/wasm'
import { engineDef } from './defs'

console.log(wasmUrl)
console.log('onconnect' in self ? 'shared' : 'dedicated')

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
	wsUrl: '',
	dbName: 'counter'
})
