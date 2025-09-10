import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import {
	type LocalHandlers,
	type Transition,
	type TransitionImpact,
	DATABASE_CHANGED_STATUS_FROM_CONNECTING_OR_NEVER_CONNECTING,
	InternalStateError
} from '@ground0/shared'
import type { ResourceBundle } from '@/types/status/ResourceBundle'

export type Ingredients<
	MemoryModel extends object,
	Impact extends TransitionImpact
> = {
	memoryModel: MemoryModel
	resources: ResourceBundle
	id: number
	transition: Transition & { impact: Impact }
	markComplete: () => unknown
	localHandler: LocalHandlers<
		MemoryModel,
		Transition & { impact: Impact }
	>[keyof LocalHandlers<MemoryModel, Transition & { impact: Impact }>]
}

export abstract class TransitionRunner<
	MemoryModel extends object,
	Impact extends TransitionImpact
> {
	protected resources: ResourceBundle

	protected abstract onDbConnected(): unknown
	protected abstract onDbConfirmedNeverConnecting(): unknown
	protected abstract onWsConnected(): unknown

	public syncResources(newBundle: Partial<ResourceBundle>) {
		if (newBundle.db && this.resources.db !== newBundle.db) {
			// Instead of calling onDbConnected or onConfirmedNeverConnecting
			// immediately, we use the action variable to queue it for after
			// this.resources.db has updated.
			let action: (() => unknown) | undefined

			if (this.resources.db.status !== DbResourceStatus.Disconnected)
				throw new InternalStateError(
					DATABASE_CHANGED_STATUS_FROM_CONNECTING_OR_NEVER_CONNECTING
				)

			if (newBundle.db.status === DbResourceStatus.ConnectedAndMigrated)
				action = this.onDbConnected.bind(this)
			if (newBundle.db.status === DbResourceStatus.NeverConnecting)
				action = this.onDbConfirmedNeverConnecting.bind(this)

			// We can do this without spreading because it's the caller's job
			// to ensure it changes its own ResourceBundle by only assigning
			// top-level values (instead of changing status and instance
			// individually), so we don't need to worry about the objects we
			// reference in this.resources changing without a call to the
			// syncResources method.
			this.resources.db = newBundle.db

			action?.()
		}
		if (newBundle.ws) {
			const shouldCall =
				this.resources.ws.status === WsResourceStatus.Disconnected &&
				newBundle.ws.status === WsResourceStatus.Connected
			this.resources.ws = newBundle.ws
			if (shouldCall) this.onWsConnected()
		}
	}

	// Communication with the object
	private sourceMarkComplete
	protected markComplete() {
		if (this.previouslyCompleted) return
		this.previouslyCompleted = true
		this.sourceMarkComplete()
	}

	protected readonly id: number
	protected readonly transitionObj: Transition & { impact: Impact }
	protected readonly localHandler: Ingredients<
		MemoryModel,
		Impact
	>['localHandler']
	protected readonly memoryModel: MemoryModel
	protected previouslyCompleted = false

	protected constructor(ingredients: Ingredients<MemoryModel, Impact>) {
		this.localHandler = ingredients.localHandler
		this.memoryModel = ingredients.memoryModel
		this.sourceMarkComplete = ingredients.markComplete
		this.resources = { ...ingredients.resources }
		this.transitionObj = ingredients.transition
		this.id = ingredients.id
	}
}
