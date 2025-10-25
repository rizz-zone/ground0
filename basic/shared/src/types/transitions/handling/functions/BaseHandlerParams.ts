import type { Transition } from '@/types/transitions/Transition'

export type BaseHandlerParams<T extends Transition> = {
	data: T['data']
}
