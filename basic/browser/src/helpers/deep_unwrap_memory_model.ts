import type { Unwrappable } from '@/types/memory_model/Unwrappable'
import { isReactiveProxy, unwrap } from './memory_model'

export function deepUnwrap<MemoryModel extends object>(
	proxy: Unwrappable<MemoryModel>
): MemoryModel {
	const shallowUnwrapped = proxy[unwrap]()
	const deepUnwrapped: { [key: PropertyKey]: unknown } = {}

	for (const [key, value] of Object.entries(shallowUnwrapped)) {
		if (typeof value === 'object' && value !== null && isReactiveProxy(value))
			deepUnwrapped[key] = deepUnwrap(value)
		else deepUnwrapped[key] = value
	}

	return deepUnwrapped as MemoryModel
}
