type TransformationBroadcastFunction = (transformation: object) => unknown
type RecursionLimitingMap = WeakMap<object, object>

function newReactiveProxy<Schema extends object>({
	initial,
	path,
	recursionLimitingMap,
	announceTransformation
}: {
	initial: Schema
	path: PropertyKey[]
	recursionLimitingMap: RecursionLimitingMap
	announceTransformation: TransformationBroadcastFunction
}) {
	{
		// These lines are necessary because if there is an unusual chain of
		// references present in `initial`, it would otherwise cause an
		// infinite recursive loop. Nobody should really be doing that anyway,
		// but accidents do happen.
		const potentialProxyToEarlyReturn = recursionLimitingMap.get(initial)
		if (typeof potentialProxyToEarlyReturn !== 'undefined') {
			console.warn(
				'A circular reference has been made inside of your memory model! ground0 can handle this, but it is generally preferable for your memory model to have a simple tree structure. https://ground0.rizz.zone/circular-refs'
			)
			return potentialProxyToEarlyReturn
		}
	}

	const proxy = new Proxy(initial, {
		get(target, prop, receiver) {
			const item = Reflect.get(target, prop, receiver)
			if (typeof item === 'function')
				return (...props: unknown[]) => {
					item(...props)
					// TODO: Check if this proxy's target is recursively equal to
					// the original. If not, re-announce ourselves
				}
		},
		set(target, prop, newValue, receiver) {
			if (typeof newValue === 'object') {
				const newPath = [...path]
				newPath.push(prop)
				Reflect.set(
					target,
					prop,
					newReactiveProxy({
						initial: newValue,
						path: newPath,
						recursionLimitingMap,
						announceTransformation
					}),
					receiver
				)
				// TODO: Announce
				return true
			}
			Reflect.set(target, prop, newValue, receiver)
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

	// Ensure this item is mapped so that an infinite loop cannot happen
	recursionLimitingMap.set(initial, proxy)

	// TODO: Run through initial and recursively turn any contained object
	// values into more proxies

	return proxy
}
export function createMemoryModel<Schema extends object>(
	initial: Schema,
	announceTransformation: TransformationBroadcastFunction
) {
	// The `recurisonLimitingMap` doesn't help in most normal situations, but
	// if an outer object contains itself, it prevents an infinite loop.
	const recursionLimitingMap: RecursionLimitingMap = new WeakMap()
	return newReactiveProxy({
		initial,
		path: [],
		recursionLimitingMap,
		announceTransformation
	}) as Schema
}
