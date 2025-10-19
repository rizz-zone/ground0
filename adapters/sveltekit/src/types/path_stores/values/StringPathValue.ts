import type { KeyOf } from './KeyOf'

export type StringPathValue<Root, Path> =
	Path extends `${infer Head}.${infer Tail}`
		? Head extends KeyOf<NonNullable<Root>>
			? StringPathValue<NonNullable<Root>[Head], Tail>
			: never
		: Path extends KeyOf<NonNullable<Root>>
			? NonNullable<Root>[Path]
			: never
