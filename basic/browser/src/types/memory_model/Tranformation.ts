import type { TransformationAction } from './TransformationAction'

export type Transformation =
	| {
			action: TransformationAction.Set
			path: readonly (string | number)[]
			newValue: unknown
	  }
	| {
			action: TransformationAction.Delete
			path: readonly (string | number)[]
	  }
