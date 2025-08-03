import type { LocalDatabase } from '@/types/LocalDatabase'
import type { ResourceStatus } from '@/types/status/ResourceStatus'
import type { Transition, TransitionImpact } from '@ground0/shared'

type SomeResources = Partial<{
	ws: WebSocket
	db: LocalDatabase
}>

export abstract class TransitionRunner<Impact extends TransitionImpact> {
	protected ws?: WebSocket
	protected db?: LocalDatabase
	protected resourceStatus: ResourceStatus

	public abstract onSomeResourceConnection(
		newStatus: ResourceStatus,
		changed: 'ws' | 'db'
	): unknown
	public syncResources(changed: SomeResources) {
		if (changed.ws) this.ws = changed.ws
		if (changed.db) this.db = changed.db
	}
	protected readonly id: number
	protected constructor(
		internallyNecessary: {
			initialResources: SomeResources
			resourceStatus: ResourceStatus
			id: number
		},
		_: Transition & { impact: Impact }
	) {
		this.resourceStatus = internallyNecessary.resourceStatus
		this.id = internallyNecessary.id
		if (internallyNecessary.initialResources.ws)
			this.ws = internallyNecessary.initialResources.ws
		if (internallyNecessary.initialResources.db)
			this.db = internallyNecessary.initialResources.db
	}
}
