import type { Transition } from '../Transition'

/**
 * The object passed into every transition handler.
 */
export type HandlerParams<T extends Transition> = {
	data: T['data']
	rawSocket: WebSocket
	connectionId: string
	transition: (transition: T) => unknown
	transitionId: number
}
