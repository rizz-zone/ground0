import type { Transition } from '../Transition'
import type { HandlerParams } from './HandlerParams'

export type GeneralHandlingFunction<T extends Transition> = (
	params: HandlerParams<T>
) => unknown | Promise<unknown>
