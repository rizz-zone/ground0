import type { Transition } from '../transitions/Transition'
import type { Update } from './Update'

export type UpdateHandlers<
	MemoryModel extends object,
	AppTransition extends Transition,
	AppUpdate extends Update
> = {
	[K in AppUpdate['action']]: (params: {
		data: Extract<AppUpdate, { action: K }>['data']
		memoryModel: MemoryModel
		transition: (transition: AppTransition) => unknown
	}) => unknown
}
