/// <reference lib="dom" />

import type { Transition } from '@/types/transitions/Transition'

/**
 * @deprecated The new handler function types are in the `functions` folder and
 * generally in use across all of the handler types now.
 *
 * The object passed into every transition handler.
 */
export type HandlerParams<T extends Transition> = {
	data: T['data']
	rawSocket: WebSocket
	connectionId: string
	transition: (transition: T) => unknown
	transitionId: number
}
