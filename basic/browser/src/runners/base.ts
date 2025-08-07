import type { LocalDatabase } from '@/types/LocalDatabase'
import type { SomeActorRef } from '@/types/SomeActorRef'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import type { ResourceStatus } from '@/types/status/ResourceStatus'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import type { Transition, TransitionImpact } from '@ground0/shared'
import type { EventObject } from 'xstate'

type SomeResources = Partial<{
	ws: WebSocket
	db: LocalDatabase
}>

export abstract class TransitionRunner<Impact extends TransitionImpact> {
	protected ws?: WebSocket
	protected db?: LocalDatabase
	protected resourceStatus: ResourceStatus

	public abstract init(): unknown
	public abstract onDbConnected(): unknown
	public abstract onDbConfirmedNeverConnecting(): unknown
	public abstract onWsConnected(): unknown

	public syncResources(changed: SomeResources, newStatus: ResourceStatus) {
		const beforeStatus = { ...this.resourceStatus }
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
			newStatus.db === DbResourceStatus.ConnectedAndMigrated
		)
			this.onWsConnected()
	}
	protected markComplete() {
		this.actorRef.send({
			type: 'transition complete',
			id: this.id
		} as unknown as EventObject)
	}

	protected readonly id: number
	protected readonly transitionObj: Transition
	private readonly actorRef: SomeActorRef

	public constructor(ingredients: {
		initialResources: SomeResources
		resourceStatus: ResourceStatus
		id: number
		transition: Transition & { impact: Impact }
		actorRef: SomeActorRef
	}) {
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
