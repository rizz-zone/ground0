import { TransitionImpact } from '@ground0/shared'
import { LocalOnlyTransitionRunner } from './specialised/local_only'
import { OptimisticPushTransitionRunner } from './specialised/optimistic_push'
import { WsOnlyNudgeTransitionRunner } from './specialised/ws_only_nudge'
import { UnreliableWsOnlyNudgeTransitionRunner } from './specialised/unreliable_ws_only_nudge'

export const runners = {
	[TransitionImpact.LocalOnly]: LocalOnlyTransitionRunner,
	[TransitionImpact.OptimisticPush]: OptimisticPushTransitionRunner,
	[TransitionImpact.WsOnlyNudge]: WsOnlyNudgeTransitionRunner,
	[TransitionImpact.UnreliableWsOnlyNudge]:
		UnreliableWsOnlyNudgeTransitionRunner
} as const
