import { type TransitionImpact } from '@ground0/shared'
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

		if ('editMemoryModel' in this.localHandler)
			Promise.resolve(
				this.localHandler.editMemoryModel({
					data: this.transitionObj.data,
					memoryModel: this.memoryModel
				})
			).then(() => this.closeIfPossible('memoryModel'))

		if (this.resourceStatus.db === DbResourceStatus.ConnectedAndMigrated)
			this.onDbConnected()
		else if (this.resourceStatus.db === DbResourceStatus.NeverConnecting)
			this.onDbConfirmedNeverConnecting()
	}
	public override onDbConnected(): void {
		if (!this.db || !('editDb' in this.localHandler)) return
		Promise.resolve(
			this.localHandler.editDb({
				db: this.db,
				data: this.transitionObj.data
			})
		).then(() => this.closeIfPossible('db'))
	}
	public override onDbConfirmedNeverConnecting(): void {
		this.closeIfPossible('db')
	}

	// Being local only, this isn't useful to us
	public override onWsConnected(): void {}
}
