export type AsKey<Key> = Key extends `${infer AsNumber extends number}`
	? AsNumber
	: Key
