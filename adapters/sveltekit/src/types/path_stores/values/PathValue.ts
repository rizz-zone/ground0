import type { ArrayPathValue } from './ArrayPathValue'
import type { AsKey } from './AsKey'
import type { StringPathValue } from './StringPathValue'

export type PathValue<Obj, P> = P extends readonly (string | number)[]
	? ArrayPathValue<Obj, { [I in keyof P]: AsKey<P[I]> }>
	: P extends string
		? StringPathValue<Obj, P>
		: never
