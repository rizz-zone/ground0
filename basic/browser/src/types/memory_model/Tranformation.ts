import type { TransformationAction } from './TransformationAction'

export type Transformation =
	| {
			action: TransformationAction.Set
			path: PropertyKey[]
			newValue: unknown
	  }
	| {
			action: TransformationAction.Delete
			path: PropertyKey[]
	  }
	| {
			action: TransformationAction.DefineProperty
	  }
