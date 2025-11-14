import type { Update } from '../updates/Update'
import type { DownstreamWsMessageAction } from './DownstreamWsMessageAction'

export type DownstreamWsMessage =
	| {
			action:
				| DownstreamWsMessageAction.OptimisticResolve
				| DownstreamWsMessageAction.OptimisticCancel
			id: number
	  }
	| {
			action: DownstreamWsMessageAction.Update
			data: Update
	  }
