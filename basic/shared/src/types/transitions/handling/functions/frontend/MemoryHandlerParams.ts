import type { Transition } from '@/types/transitions/Transition'
import type { BaseHandlerParams } from '../BaseHandlerParams'

export type MemoryHandlerParams<
	MemoryModel extends object,
	AppTransition extends Transition
> = {
	memoryModel: MemoryModel
} & BaseHandlerParams<AppTransition>
