import type { Transition } from '@/types/transitions/Transition'
import type { BaseHandlerParams } from '../BaseHandlerParams'
import type { LocalDatabase } from '@/types/LocalDatabase'

export type DbHandlerParams<AppTransition extends Transition> = {
	db: LocalDatabase
} & BaseHandlerParams<AppTransition>
