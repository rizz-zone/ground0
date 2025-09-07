import { TransitionImpact } from '@ground0/shared'
import { LocalOnlyTransitionRunner } from './specialised/local_only'
import { OptimisticPushTransitionRunner } from './specialised/optimistic_push'

export const runners = {
	[TransitionImpact.LocalOnly]: LocalOnlyTransitionRunner,
	[TransitionImpact.OptimisticPush]: OptimisticPushTransitionRunner
} as const
