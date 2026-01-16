export type ArrayPath<MemoryModel extends object> = {
	[K in keyof MemoryModel & (string | number)]: NonNullable<
		MemoryModel[K]
	> extends object
		? readonly [K] | readonly [K, ...ArrayPath<NonNullable<MemoryModel[K]>>]
		: readonly [K]
}[keyof MemoryModel & (string | number)]
