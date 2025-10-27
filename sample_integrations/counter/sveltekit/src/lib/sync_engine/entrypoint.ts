import { TransitionAction, type AppTransition, type MemoryModel } from './types'
import { fetchWasmFromUrl, workerEntrypoint } from 'ground0/worker'
import { wasmUrl } from 'ground0/wasm'
import { engineDef } from './defs'

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
	pullWasmBinary: fetchWasmFromUrl(wasmUrl),
	wsUrl: '',
	dbName: ''
})
