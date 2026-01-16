import type { UpdateImpact } from './UpdateImpact'

export type Update = {
	action: string | number
	impact: UpdateImpact
	data?:
		| {
				[x: string]: unknown
		  }
		| undefined
}
