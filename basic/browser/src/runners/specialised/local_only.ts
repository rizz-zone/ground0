import { type TransitionImpact } from '@ground0/shared'
import { TransitionRunner, type Ingredients } from '../base'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'

// TODO: Handle errors

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

		if (this.resources.db.status === DbResourceStatus.ConnectedAndMigrated)
			this.onDbConnected()
		else if (this.resources.db.status === DbResourceStatus.NeverConnecting)
			this.onDbConfirmedNeverConnecting()
	}
	protected override onDbConnected(): void {
		if (
			this.resources.db.status !== DbResourceStatus.ConnectedAndMigrated ||
			!('editDb' in this.localHandler)
		)
			return
		Promise.resolve(
			this.localHandler.editDb({
				db: this.resources.db.instance,
				data: this.transitionObj.data
			})
		).then(() => this.closeIfPossible('db'))
	}
	protected override onDbConfirmedNeverConnecting(): void {
		this.closeIfPossible('db')
	}

	// Being local only, this isn't useful to us
	protected override onWsConnected(): void {}
}
