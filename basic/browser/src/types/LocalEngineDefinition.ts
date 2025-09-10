import type {
	Transition,
	SyncEngineDefinition,
	LocalHandlers
} from '@ground0/shared'
import type { Migrations } from './Migrations'

export type LocalEngineDefinition<
	MemoryModel extends object,
	T extends Transition
> = {
	engineDef: SyncEngineDefinition<T>
	localHandlers: LocalHandlers<MemoryModel, T>
	initialMemoryModel: MemoryModel
	migrations: Migrations
	pullWasmBinary: () => Promise<ArrayBuffer>
	wsUrl: string
	dbName: string
}
