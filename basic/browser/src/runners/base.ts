import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import type { ResourceStatus } from '@/types/status/ResourceStatus'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import type {
	LocalHandlers,
	Transition,
	TransitionImpact,
	LocalDatabase
} from '@ground0/shared'
import type { ActorRefFrom } from 'xstate'
import type { clientMachine } from '@/machines/worker'

export type Ingredients<
	MemoryModel extends object,
	Impact extends TransitionImpact
> = {
	initialResources: SomeResources
	memoryModel: MemoryModel
	resourceStatus: ResourceStatus
	id: number
	transition: Transition & { impact: Impact }
	actorRef: ActorRefFrom<typeof clientMachine>
	localHandler: LocalHandlers<
		MemoryModel,
		Transition & { impact: Impact }
	>[keyof LocalHandlers<MemoryModel, Transition & { impact: Impact }>]
}
type SomeResources = Partial<{
	ws: WebSocket
	db: LocalDatabase
}>

export abstract class TransitionRunner<
	MemoryModel extends object,
	Impact extends TransitionImpact
> {
	protected ws?: WebSocket
	protected db?: LocalDatabase
	protected resourceStatus: ResourceStatus

	protected abstract onDbConnected(): unknown
	protected abstract onDbConfirmedNeverConnecting(): unknown
	protected abstract onWsConnected(): unknown

	public syncResources(changed: SomeResources, newStatus: ResourceStatus) {
		const beforeStatus = { ...this.resourceStatus }
		this.resourceStatus = newStatus
		if (changed.ws) this.ws = changed.ws
		if (changed.db) this.db = changed.db

		if (
			beforeStatus.db === DbResourceStatus.Disconnected &&
			newStatus.db === DbResourceStatus.ConnectedAndMigrated
		)
			this.onDbConnected()
		if (
			beforeStatus.db === DbResourceStatus.Disconnected &&
			newStatus.db === DbResourceStatus.NeverConnecting
		)
			this.onDbConfirmedNeverConnecting()
		if (
			beforeStatus.ws === WsResourceStatus.Disconnected &&
			newStatus.ws === WsResourceStatus.Connected
		)
			this.onWsConnected()
	}

	// Communication with the object
	protected markComplete() {
		if (this.previouslyCompleted) return
		this.previouslyCompleted = true
		this.actorRef.send({
			type: 'transition complete',
			id: this.id
		})
	}

	protected readonly id: number
	protected readonly transitionObj: Transition & { impact: Impact }
	private readonly actorRef: ActorRefFrom<typeof clientMachine>
	protected readonly localHandler: Ingredients<
		MemoryModel,
		Impact
	>['localHandler']
	protected readonly memoryModel: MemoryModel
	protected previouslyCompleted = false

	protected constructor(ingredients: Ingredients<MemoryModel, Impact>) {
		this.localHandler = ingredients.localHandler
		this.memoryModel = ingredients.memoryModel
		this.actorRef = ingredients.actorRef
		this.resourceStatus = ingredients.resourceStatus
		this.transitionObj = ingredients.transition
		this.id = ingredients.id
		if (ingredients.initialResources.ws)
			this.ws = ingredients.initialResources.ws
		if (ingredients.initialResources.db)
			this.db = ingredients.initialResources.db
	}
}
