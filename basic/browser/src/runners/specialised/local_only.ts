import type { TransitionImpact } from '@ground0/shared'
import { TransitionRunner, type Ingredients } from '../base'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'

export class LocalOnlyTransitionRunner extends TransitionRunner<TransitionImpact.LocalOnly> {
	private closeIfPossible() {}

	public constructor(ingredients: Ingredients<TransitionImpact.LocalOnly>) {
		super(ingredients)

		if (this.resourceStatus.db === DbResourceStatus.ConnectedAndMigrated)
			this.onDbConnected()
	}
	public override onDbConnected(): void {
		if (!this.db || !('editDb' in this.localHandler)) return
		const response = this.localHandler.editDb({
			db: this.db,
			data: this.transitionObj.data
		})
		if (response instanceof Promise)
			response.then(this.closeIfPossible.bind(this))
		else this.closeIfPossible()
	}
	public override onDbConfirmedNeverConnecting(): void {
		this.closeIfPossible()
	}

	// Being local only, this isn't useful to us
	public override onWsConnected(): void {}
}
