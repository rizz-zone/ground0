import type { KeyOf } from './KeyOf'

export type ArrayPathValue<Root, Path> = Path extends []
	? Root
	: Path extends [infer Head, ...infer Tail]
		? Head extends KeyOf<NonNullable<Root>>
			? ArrayPathValue<NonNullable<Root>[Head], Tail>
			: never
		: never
