function newReactiveProxy<Schema extends object>(
	initial: Schema,
	path: PropertyKey[]
) {
	return new Proxy(initial, {
		get(_target, _prop, _receiver) {
			// TODO: Complete this
		},
		set(target, prop, newValue) {
			target[prop] = newValue
			// TODO: Announce the transformation
			return false
		},
		deleteProperty(_target, _prop) {
			// TODO: Complete this
			return false
		},
		defineProperty(_target, _prop, _attributes) {
			// TODO: Complete this
			return false
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as ProxyHandler<Record<PropertyKey, any>>)
}
export function createMemoryModel<Schema extends object>(
	initial: Schema,
	_announceTransformation: unknown
) {
	return newReactiveProxy(initial, []) as Schema
}
