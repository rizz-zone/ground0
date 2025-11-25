import type { Transition, TransitionImpact } from '@ground0/shared'
import { TransitionRunner } from '../base'

export class WsOnlyNudgeTransitionRunner<
	MemoryModel extends object,
	AppTransition extends Transition & {
		impact: TransitionImpact.WsOnlyNudge
	}
> extends TransitionRunner<
	MemoryModel,
	TransitionImpact.WsOnlyNudge,
	AppTransition
> {}
