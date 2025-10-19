export type ArrayPath<MemoryModel extends object> = {
	[K in keyof MemoryModel & (string | number)]: NonNullable<
		MemoryModel[K]
	> extends object
		? [K] | [K, ...ArrayPath<NonNullable<MemoryModel[K]>>]
		: [K]
}[keyof MemoryModel & (string | number)]
