type TransformationBroadcastFunction = (transformation: object) => unknown

function newReactiveProxy<Schema extends object>(
	initial: Schema,
	path: PropertyKey[],
	announceTransformation: TransformationBroadcastFunction
) {
	// TODO: Run through initial and recursively turn any contained object values into more proxies
	return new Proxy(initial, {
		get(target, prop, _receiver) {
			const item = target[prop]
			if (typeof item === 'function')
				return (...props: unknown[]) => {
					item(...props)
					// TODO: Check if this proxy's target is recursively equal to
					// the original. If not, re-announce ourselves
				}
		},
		set(target, prop, newValue) {
			if (typeof newValue === 'object') {
				const newPath = [...path]
				newPath.push(prop)
				target[prop] = newReactiveProxy(
					newValue,
					newPath,
					announceTransformation
				)
				// TODO: Announce
				return true
			}
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
	announceTransformation: TransformationBroadcastFunction
) {
	return newReactiveProxy(initial, [], announceTransformation) as Schema
}
