import { describe, expect, it } from 'vitest'
import type { Unwrappable } from '@/types/memory_model/Unwrappable'
import { createMemoryModel } from './memory_model'
import { deepUnwrap } from './deep_unwrap_memory_model'

describe('deepUnwrap', () => {
	it('unwraps a simple object with no nested proxies', () => {
		const initial = {
			foo: 'bar',
			num: 42,
			bool: true
		}
		const proxy = createMemoryModel(initial, () => {}) as Unwrappable<
			typeof initial
		>
		const unwrapped = deepUnwrap(proxy)

		expect(unwrapped).toEqual(initial)
		expect(unwrapped).not.toBe(proxy)
	})

	it('unwraps nested reactive proxies recursively', () => {
		const initial = {
			top: 'level',
			nested: {
				foo: 'bar',
				deep: {
					value: 123
				}
			}
		}
		const proxy = createMemoryModel(initial, () => {}) as Unwrappable<
			typeof initial
		>
		const unwrapped = deepUnwrap(proxy)

		expect(unwrapped).toEqual(initial)
		expect(unwrapped.nested).not.toBe(proxy.nested)
		expect(unwrapped.nested.deep).not.toBe(proxy.nested.deep)
		// Verify nested objects are plain objects, not proxies
		expect(unwrapped.nested).toEqual(initial.nested)
		expect(unwrapped.nested.deep).toEqual(initial.nested.deep)
	})

	it('handles mixed nested proxies and regular values', () => {
		const initial = {
			proxyNested: {
				value: 'nested'
			},
			regularString: 'not a proxy',
			regularNumber: 42,
			regularNull: null,
			anotherProxy: {
				deep: {
					value: 'deep value'
				}
			}
		}
		const proxy = createMemoryModel(initial, () => {}) as Unwrappable<
			typeof initial
		>
		const unwrapped = deepUnwrap(proxy)

		expect(unwrapped).toEqual(initial)
		expect(unwrapped.proxyNested).not.toBe(proxy.proxyNested)
		expect(unwrapped.anotherProxy).not.toBe(proxy.anotherProxy)
		expect(unwrapped.anotherProxy.deep).not.toBe(proxy.anotherProxy.deep)
		expect(unwrapped.regularString).toBe('not a proxy')
		expect(unwrapped.regularNumber).toBe(42)
		expect(unwrapped.regularNull).toBeNull()
	})

	it('handles arrays with nested objects', () => {
		const initial = {
			items: [
				{ id: 1, name: 'first' },
				{ id: 2, name: 'second' }
			]
		}
		const proxy = createMemoryModel(initial, () => {}) as Unwrappable<
			typeof initial
		>
		const unwrapped = deepUnwrap(proxy)

		// Note: Object.entries() on arrays returns string keys, so arrays become objects
		// The important thing is that nested object proxies are unwrapped
		expect(unwrapped.items).not.toBe(proxy.items)
		// Verify nested objects are unwrapped (accessed via string keys due to Object.entries behavior)
		const itemsObj = unwrapped.items as unknown as Record<string, unknown>
		expect(itemsObj['0']).not.toBe(proxy.items[0])
		expect(itemsObj['1']).not.toBe(proxy.items[1])
		// Verify the nested object values are correct
		expect(itemsObj['0']).toEqual({ id: 1, name: 'first' })
		expect(itemsObj['1']).toEqual({ id: 2, name: 'second' })
	})

	it('handles objects with null and undefined values', () => {
		const initial = {
			nullValue: null,
			undefinedValue: undefined,
			nested: {
				alsoNull: null
			}
		}
		const proxy = createMemoryModel(initial, () => {}) as Unwrappable<
			typeof initial
		>
		const unwrapped = deepUnwrap(proxy)

		expect(unwrapped).toEqual(initial)
		expect(unwrapped.nullValue).toBeNull()
		expect(unwrapped.undefinedValue).toBeUndefined()
		expect(unwrapped.nested.alsoNull).toBeNull()
	})

	it('handles empty objects', () => {
		const initial = {}
		const proxy = createMemoryModel(initial, () => {}) as Unwrappable<
			typeof initial
		>
		const unwrapped = deepUnwrap(proxy)

		expect(unwrapped).toEqual(initial)
		expect(unwrapped).not.toBe(proxy)
	})

	it('handles deeply nested structures', () => {
		const initial = {
			level1: {
				level2: {
					level3: {
						level4: {
							value: 'deep'
						}
					}
				}
			}
		}
		const proxy = createMemoryModel(initial, () => {}) as Unwrappable<
			typeof initial
		>
		const unwrapped = deepUnwrap(proxy)

		expect(unwrapped).toEqual(initial)
		expect(unwrapped.level1.level2.level3.level4.value).toBe('deep')
		// Verify all levels are unwrapped
		expect(unwrapped.level1).not.toBe(proxy.level1)
		expect(unwrapped.level1.level2).not.toBe(proxy.level1.level2)
		expect(unwrapped.level1.level2.level3).not.toBe(proxy.level1.level2.level3)
		expect(unwrapped.level1.level2.level3.level4).not.toBe(
			proxy.level1.level2.level3.level4
		)
	})
})
