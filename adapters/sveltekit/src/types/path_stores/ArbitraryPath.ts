import type { getProperty } from 'dot-prop'

export type ArbitraryPath = Extract<
	Parameters<typeof getProperty>[1],
	readonly PropertyKey[]
>
