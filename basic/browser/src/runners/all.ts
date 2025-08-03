import { TransitionImpact } from '@ground0/shared'
import type { TransitionRunner } from './base'
import { LocalOnlyTransitionRunner } from './specialised/local_only'
import { OptimisticPushTransitionRunner } from './specialised/optimistic_push'

export const runners: {
	[T in TransitionImpact]: typeof TransitionRunner<T>
} = {
	[TransitionImpact.LocalOnly]: LocalOnlyTransitionRunner,
	[TransitionImpact.OptimisticPush]: OptimisticPushTransitionRunner
}
