/// <reference lib="dom" />

import type { Transition } from '@/types/transitions/Transition'

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
