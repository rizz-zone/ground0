import type { TransitionImpact } from '@ground0/shared'
import { TransitionRunner, type Ingredients } from '../base'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'

export class LocalOnlyTransitionRunner<
	MemoryModel extends object
> extends TransitionRunner<MemoryModel, TransitionImpact.LocalOnly> {
	private completeElements = {
		memoryModel: false,
		db: false
	}

	private closeIfPossible(nowComplete: keyof typeof this.completeElements) {
		this.completeElements[nowComplete] = true
		if (
			('editDb' in this.localHandler && !this.completeElements.db) ||
			('editMemoryModel' in this.localHandler &&
				!this.completeElements.memoryModel)
		)
			return
		this.markComplete()
	}

	public constructor(
		ingredients: Ingredients<MemoryModel, TransitionImpact.LocalOnly>
	) {
		super(ingredients)

		if ('editMemoryModel' in this.localHandler) {
			const potentialPromise = this.localHandler.editMemoryModel({
				data: this.transitionObj.data,
				memoryModel: this.memoryModel
			})
			if (potentialPromise instanceof Promise)
				potentialPromise.then(() => this.closeIfPossible('memoryModel'))
			else this.closeIfPossible('memoryModel')
		}
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
			response.then(() => this.closeIfPossible('db'))
		else this.closeIfPossible('db')
	}
	public override onDbConfirmedNeverConnecting(): void {
		this.closeIfPossible('db')
	}

	// Being local only, this isn't useful to us
	public override onWsConnected(): void {}
}
