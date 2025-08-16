import type { TransitionImpact } from '@ground0/shared'
import { TransitionRunner, type Ingredients } from '../base'

export class OptimisticPushTransitionRunner<
	MemoryModel extends object
> extends TransitionRunner<MemoryModel, TransitionImpact.OptimisticPush> {
	public constructor(
		ingredients: Ingredients<MemoryModel, TransitionImpact.OptimisticPush>
	) {
		super(ingredients)
	}
	public override onDbConnected(): unknown {
		throw new Error('Method not implemented.')
	}
	public override onDbConfirmedNeverConnecting(): unknown {
		throw new Error('Method not implemented.')
	}
	public override onWsConnected(): unknown {
		throw new Error('Method not implemented.')
	}
}
