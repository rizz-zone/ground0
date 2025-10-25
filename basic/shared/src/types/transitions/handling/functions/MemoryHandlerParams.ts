import type { Transition } from '@/types/transitions/Transition'
import type { BaseHandlerParams } from './BaseHandlerParams'

export type MemoryHandlerParams<
	MemoryModel extends object,
	T extends Transition
> = {
	memoryModel: MemoryModel
} & BaseHandlerParams<T>
