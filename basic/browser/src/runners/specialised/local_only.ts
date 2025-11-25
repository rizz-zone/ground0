import {
	minimallyIdentifiedErrorLog,
	type Transition,
	type TransitionImpact
} from '@ground0/shared'
import {
	TransitionRunner,
	type TransitionRunnerInputIngredients
} from '../base'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'

export class LocalOnlyTransitionRunner<
	MemoryModel extends object,
	AppTransition extends Transition & { impact: TransitionImpact.LocalOnly }
> extends TransitionRunner<
	MemoryModel,
	TransitionImpact.LocalOnly,
	AppTransition
> {
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
		ingredients: TransitionRunnerInputIngredients<
			MemoryModel,
			TransitionImpact.LocalOnly,
			AppTransition
		>
	) {
		super(ingredients)

		if ('editMemoryModel' in this.localHandler) {
			const onSucceed = () => this.closeIfPossible('memoryModel')
			const onFail = () => {
				console.warn(minimallyIdentifiedErrorLog('memory model'))
				onSucceed()
			}
			try {
				Promise.resolve(
					this.localHandler.editMemoryModel({
						data: this.transitionObj.data,
						memoryModel: this.memoryModel
					})
				).then(onSucceed, onFail)
			} catch {
				onFail()
			}
		}

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

		const onSucceed = () => this.closeIfPossible('db')
		const onFail = () => {
			console.warn(minimallyIdentifiedErrorLog('database'))
			onSucceed()
		}
		try {
			Promise.resolve(
				this.localHandler.editDb({
					db: this.resources.db.instance,
					data: this.transitionObj.data,
					memoryModel: this.memoryModel
				})
			).then(onSucceed, onFail)
		} catch {
			onFail()
		}
	}
	protected override onDbConfirmedNeverConnecting(): void {
		this.closeIfPossible('db')
	}

	// Being local only, this isn't useful to us
	protected override onWsConnected(): void {}
}
