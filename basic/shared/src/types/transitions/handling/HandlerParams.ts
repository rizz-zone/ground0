import type { UUID } from '@/types/common/UUID'
import type { Transition } from '../Transition'

/**
 * The
 */
export type HandlerParams<T extends Transition> = {
	data: T['data']
	rawSocket: WebSocket
	connectionId: string
	transition: (transition: T) => unknown
	transitionId: UUID
}
