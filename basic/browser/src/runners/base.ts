import type { ResourceStatus } from '@/types/status/ResourceStatus'
import type { Transition, TransitionImpact } from '@ground0/shared'

export abstract class TransitionRunner<Impact extends TransitionImpact> {
	public abstract onSomeResourceConnection(
		newStatus: ResourceStatus,
		changed: 'ws' | 'db'
	): unknown
	protected constructor(_: Transition & { impact: Impact }) {}
}
