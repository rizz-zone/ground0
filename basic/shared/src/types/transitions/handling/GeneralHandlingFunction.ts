import type { Transition } from '../Transition'
import type { HandlerParams } from './HandlerParams'

/**
 * @deprecated Turns out a 'general handler' is cringe 100% of the time
 */
export type GeneralHandlingFunction<T extends Transition> = (
	params: HandlerParams<T>
) => unknown | Promise<unknown>
