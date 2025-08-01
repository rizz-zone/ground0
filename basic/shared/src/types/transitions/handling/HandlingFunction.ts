import type { Transition } from '../Transition'

/**
 * @deprecated Different transition impacts need fundamentally different functions.
 */
export type HandlingFunction<T extends Transition, K> = (
	data: (T & { action: K })['data']
) => unknown
