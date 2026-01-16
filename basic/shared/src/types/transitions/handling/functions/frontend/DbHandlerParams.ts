import type { Transition } from '@/types/transitions/Transition'
import type { LocalDatabase } from '@/types/LocalDatabase'
import type { MemoryHandlerParams } from './MemoryHandlerParams'

export type DbHandlerParams<
	MemoryModel extends object,
	AppTransition extends Transition
> = {
	db: LocalDatabase
} & MemoryHandlerParams<MemoryModel, AppTransition>
