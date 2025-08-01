/// <reference types="@cloudflare/workers-types" />

import type { Transition } from '../../Transition'
import type { TransitionImpact } from '../../TransitionImpact'
import type { HandlerParams } from '../HandlerParams'
import type { RequiredActionsForImpact } from '../RequiredActionsForImpact'

export type BackendHandlers<T extends Transition> = {
	[K in RequiredActionsForImpact<
		T,
		TransitionImpact.OptimisticPush
	>]: T extends { impact: TransitionImpact.OptimisticPush }
		? {
				confirm: (params: HandlerParams<T>) => boolean | Promise<boolean>
			}
		: never
}
