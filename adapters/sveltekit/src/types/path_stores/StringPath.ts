export type StringPath<MemoryModel extends object> = {
	[K in keyof MemoryModel & (string | number)]: MemoryModel[K] extends object
		? `${K}` | `${K}.${StringPath<NonNullable<MemoryModel[K]>>}`
		: `${K}`
}[keyof MemoryModel & (string | number)]

type MemoryModel = {
	foo: {
		bar?: { baz: 'c' }
		funnyBaz: 3
	}
}
const path = 'f' satisfies StringPath<MemoryModel>
