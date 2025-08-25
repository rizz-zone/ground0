import {
	handlerThrew,
	InternalStateError,
	OPTIMISTIC_PUSH_IN_USE_BEFORE_DATBASE_STATE_FINALISED,
	OPTIMISTIC_PUSH_NOT_EVALUATED,
	type TransitionImpact
} from '@ground0/shared'
import { TransitionRunner, type Ingredients } from '../base'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'

const enum EditStatus {
	NotEvaluated,
	NotRequired,
	AwaitingResource,
	InProgress,
	Complete,
	Failed
}

export class OptimisticPushTransitionRunner<
	MemoryModel extends object
> extends TransitionRunner<MemoryModel, TransitionImpact.OptimisticPush> {
	private edits: {
		memoryModel?: Promise<unknown>
		db?: Promise<unknown>
	} = {}
	private readonly editStatus: {
		memoryModel: EditStatus
		db: EditStatus
	} = {
		memoryModel: EditStatus.NotEvaluated,
		db: EditStatus.NotEvaluated
	}

	private attemptDbHandler(): boolean {
		if (
			this.resourceStatus.db !== DbResourceStatus.ConnectedAndMigrated ||
			!this.db ||
			!('editDb' in this.localHandler)
		)
			return false

		this.editStatus.db = EditStatus.InProgress

		try {
			const promise = Promise.resolve(
				this.localHandler.editDb({
					data: this.transitionObj.data,
					db: this.db
				})
			).then(
				() => {
					this.editStatus.db = EditStatus.Complete
				},
				(rejection) => {
					console.error(handlerThrew('editDb', true))
					console.error(rejection)
					this.editStatus.db = EditStatus.Failed
				}
			)

			this.edits.db = promise
		} catch (e) {
			console.error(handlerThrew('editDb', false))
			console.error(e)
			this.editStatus.db = EditStatus.Failed
		}

		return true
	}

	public constructor(
		ingredients: Ingredients<MemoryModel, TransitionImpact.OptimisticPush>
	) {
		super(ingredients)

		if ('editMemoryModel' in this.localHandler) {
			this.editStatus.memoryModel = EditStatus.InProgress
			const promise = Promise.resolve(
				this.localHandler.editMemoryModel({
					data: this.transitionObj.data,
					memoryModel: this.memoryModel
				})
			)
			promise.then(() => {
				this.editStatus.memoryModel = EditStatus.Complete
			})
			this.edits.memoryModel = promise
		} else this.editStatus.memoryModel = EditStatus.NotRequired

		if ('editDb' in this.localHandler) {
			if (!this.attemptDbHandler())
				this.editStatus.db = EditStatus.AwaitingResource
		} else this.editStatus.db = EditStatus.NotRequired
	}

	private considerThrowingErrorOnDbResourceEvent(): void {
		switch (this.editStatus.db) {
			case EditStatus.NotRequired:
				return
			case EditStatus.NotEvaluated:
				throw new InternalStateError(OPTIMISTIC_PUSH_NOT_EVALUATED)
			case EditStatus.Complete:
			case EditStatus.Failed:
			case EditStatus.InProgress:
				throw new InternalStateError(
					OPTIMISTIC_PUSH_IN_USE_BEFORE_DATBASE_STATE_FINALISED
				)
		}
	}
	public override onDbConnected() {
		if (this.editStatus.db === EditStatus.AwaitingResource)
			this.attemptDbHandler()
		else this.considerThrowingErrorOnDbResourceEvent()
	}
	public override onDbConfirmedNeverConnecting() {
		if (this.editStatus.db === EditStatus.AwaitingResource)
			this.editStatus.db = EditStatus.NotRequired
		else this.considerThrowingErrorOnDbResourceEvent()
	}
	public override onWsConnected(): unknown {
		throw new Error('Method not implemented.')
	}
}
