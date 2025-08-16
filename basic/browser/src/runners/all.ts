import { TransitionImpact } from '@ground0/shared'
import type { Ingredients, TransitionRunner } from './base'
import { LocalOnlyTransitionRunner } from './specialised/local_only'
import { OptimisticPushTransitionRunner } from './specialised/optimistic_push'

export const runners: {
	[T in TransitionImpact]: new (
		ingredients: Ingredients<object, T>
	) => TransitionRunner<object, T>
} = {
	[TransitionImpact.LocalOnly]: LocalOnlyTransitionRunner,
	[TransitionImpact.OptimisticPush]: OptimisticPushTransitionRunner
}
