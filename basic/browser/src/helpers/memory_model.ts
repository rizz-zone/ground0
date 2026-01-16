import type { Transformation } from '@/types/memory_model/Tranformation'
import { TransformationAction } from '@/types/memory_model/TransformationAction'
import type { Unwrappable } from '@/types/memory_model/Unwrappable'

type TransformationBroadcastFunction = (
	transformation: Transformation
) => unknown
type RecursionLimitingMap = WeakMap<object, object>

export const unwrap = Symbol()
const globalProxyRegistry = new WeakSet()

type IncidentalHasRelevantUnwrapGuard = (
	value: WeakKey
) => value is Unwrappable<never>
export const isReactiveProxy: IncidentalHasRelevantUnwrapGuard =
	globalProxyRegistry.has.bind(
		globalProxyRegistry
	) as IncidentalHasRelevantUnwrapGuard

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

	// Ensure the proxy can be unwrapped
	Object.defineProperty(initial, unwrap, {
		value: () => initial,
		enumerable: false,
		configurable: false,
		writable: false
	})

	const proxy = new Proxy(initial, {
		// We omit receiver because the main thread won't have one. This will
		// lead to more consistent behaviour, and less random sync bugs.
		set(target, prop, newValue) {
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
					})
				)
			} else Reflect.set(target, prop, newValue)

			const targetPath = [...path]
			targetPath.push(prop)
			announceTransformation({
				action: TransformationAction.Set,
				path: targetPath as readonly (string | number)[],
				newValue
			})
			return true
		},
		deleteProperty(target, prop) {
			Reflect.deleteProperty(target, prop)

			const targetPath = [...path]
			targetPath.push(prop)
			announceTransformation({
				action: TransformationAction.Delete,
				path: targetPath as readonly (string | number)[]
			})
			return true
		},
		defineProperty(target, prop, attributes) {
			Reflect.defineProperty(target, prop, attributes)

			// While we'll do the operation, we won't let the consumer think
			// this means everything worked (because it didn't)
			console.warn(
				'defineProperty was used on your memory model! This only impacts the copy of the memory model that your worker has, so it may be out of sync with the client now. https://ground0.rizz.zone/non-sync-methods'
			)
			return true
		},
		preventExtensions(target) {
			Reflect.preventExtensions(target)

			console.warn(
				'preventExtensions was used on your memory model! This only impacts the copy of the memory model that your worker has, so it may be out of sync with the client now. https://ground0.rizz.zone/non-sync-methods'
			)
			return true
		}
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as ProxyHandler<Record<PropertyKey, any>>)

	// Ensure this item is mapped so that an infinite loop cannot happen
	recursionLimitingMap.set(initial, proxy)
	// Also ensure it's registered as a proxy for reference elsewhere
	globalProxyRegistry.add(proxy)

	// Loop through iniital to ensure all nested objects are reactive proxies
	for (const key in initial) {
		const current = (initial as Record<PropertyKey, unknown>)[key]
		if (current !== null && typeof current === 'object') {
			const newPath = [...path]
			newPath.push(key)
			Reflect.set(
				initial as object,
				key,
				newReactiveProxy({
					initial: current as Record<PropertyKey, unknown>,
					path: newPath,
					recursionLimitingMap,
					announceTransformation
				})
			)
		}
	}

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
		// Create a structured clone so that the consumer can't find any way to
		// do a strange thing with `initial` that confuses our Perfect and
		// Rock-Solid memory model's sync
		initial: structuredClone(initial),
		path: [],
		recursionLimitingMap,
		announceTransformation
	}) as Schema
}
