import type { Update } from '@/types/updates/Update'
import type { UpdateImpact } from '@/types/updates/UpdateImpact'

export type TestingUpdate = Update &
	(
		| {
				action: 3
				impact: UpdateImpact.Reliable
		  }
		| {
				action: 'baz'
				impact: UpdateImpact.Unreliable
				data: {
					information: boolean
				}
		  }
	)
