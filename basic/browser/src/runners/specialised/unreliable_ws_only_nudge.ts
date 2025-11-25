import {
	UpstreamWsMessageAction,
	type Transition,
	type TransitionImpact,
	type UpstreamWsMessage
} from '@ground0/shared'
import {
	TransitionRunner,
	type TransitionRunnerInputIngredients
} from '../base'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import SuperJSON from 'superjson'

export class UnreliableWsOnlyNudgeTransitionRunner<
	MemoryModel extends object,
	AppTransition extends Transition & {
		impact: TransitionImpact.UnreliableWsOnlyNudge
	}
> extends TransitionRunner<
	MemoryModel,
	TransitionImpact.UnreliableWsOnlyNudge,
	AppTransition
> {
	// This transition runner does not operate on the db
	protected override onDbConnected() {}
	protected override onDbConfirmedNeverConnecting() {}

	protected override onWsConnected() {
		;(
			this.resources.ws as ResourceBundle['ws'] & {
				status: WsResourceStatus.Connected
			}
		).instance.send(
			SuperJSON.stringify({
				action: UpstreamWsMessageAction.Transition,
				id: this.id,
				data: this.transitionObj
			} satisfies UpstreamWsMessage)
		)
		this.markComplete()
	}
	public constructor(
		ingredients: TransitionRunnerInputIngredients<
			MemoryModel,
			TransitionImpact.UnreliableWsOnlyNudge,
			AppTransition
		>
	) {
		super(ingredients)
		if (this.resources.ws.status === WsResourceStatus.Connected)
			this.onWsConnected()
	}
}
