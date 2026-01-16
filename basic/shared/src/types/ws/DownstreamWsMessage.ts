import type { Update } from '../updates/Update'
import type { DownstreamWsMessageAction } from './DownstreamWsMessageAction'

export type DownstreamWsMessage =
	| {
			action:
				| DownstreamWsMessageAction.OptimisticResolve
				| DownstreamWsMessageAction.OptimisticCancel
				| DownstreamWsMessageAction.AckWsNudge
			id: number
	  }
	| {
			action: DownstreamWsMessageAction.Update
			data: Update
	  }
