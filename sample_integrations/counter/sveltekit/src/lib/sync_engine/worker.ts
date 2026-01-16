import { type MemoryModel } from './MemoryModel'
import { workerEntrypoint } from 'ground0/worker'
import {
	dbSchema,
	engineDef,
	TransitionAction,
	UpdateAction,
	type AppTransition,
	type AppUpdate
} from '@ground0/sample-counter-shared'
import { TransitionImpact } from 'ground0'
import { eq } from 'drizzle-orm'

let wsUrl: string
try {
	wsUrl = __WS_URL__
} catch {
	wsUrl = 'ws://localhost:8787/ws'
}

workerEntrypoint<MemoryModel, AppTransition, AppUpdate>({
	engineDef,
	initialMemoryModel: {
		counter: 0,
		syncedFromRemote: false
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
		},
		[TransitionAction.SyncFromLocalDbIfNoRemoteSync]: {
			editDb: async ({ memoryModel, db }) => {
				try {
					if (memoryModel.syncedFromRemote) return
					const dbResult = await db
						.select({ value: dbSchema.counter.value })
						.from(dbSchema.counter)
						.where(eq(dbSchema.counter.id, 0))
						.limit(1)
						.get()
					if (memoryModel.syncedFromRemote || !dbResult) return
					memoryModel.counter = dbResult.value
				} catch (e) {
					console.error(e)
				}
			}
		},
		[TransitionAction.SaveApprovedRemoteValueToDb]: {
			editDb: async ({ data, db }) => {
				await db
					.insert(dbSchema.counter)
					.values(data)
					.onConflictDoUpdate({ target: dbSchema.counter.id, set: data })
					.execute()
			}
		}
	},
	updateHandlers: {
		[UpdateAction.InitialValue]: ({ memoryModel, data, transition }) => {
			memoryModel.counter = data.value
			memoryModel.syncedFromRemote = true
			transition({
				action: TransitionAction.SaveApprovedRemoteValueToDb,
				impact: TransitionImpact.LocalOnly,
				data
			})
		},
		[UpdateAction.Increment]: ({ memoryModel }) => {
			memoryModel.counter++
		}
	},
	autoTransitions: {
		onDbConnect: {
			action: TransitionAction.SyncFromLocalDbIfNoRemoteSync,
			impact: TransitionImpact.LocalOnly
		}
	},
	wsUrl,
	dbName: 'counter'
})
