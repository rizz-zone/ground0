import type { Transition } from '../../Transition'

export type BaseHandlerParams<T extends Transition> = {
	data: T['data']
}
