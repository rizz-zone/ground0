import type { Transition } from '@/types/transitions/Transition'

export type BaseHandlerParams<AppTransition extends Transition> = {
	data: AppTransition['data']
}
