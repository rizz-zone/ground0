export type StringPath<MemoryModel extends object> = {
	[K in keyof MemoryModel & (string | number)]: NonNullable<
		MemoryModel[K]
	> extends object
		? `${K}` | `${K}.${StringPath<NonNullable<MemoryModel[K]>>}`
		: `${K}`
}[keyof MemoryModel & (string | number)]
