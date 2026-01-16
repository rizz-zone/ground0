import { describe, it, expect, vi } from 'vitest'
import { MemoryModelStore } from './memory_model'

describe('MemoryModelStore', () => {
	it('initializes with undefined currentValue', () => {
		const store = new MemoryModelStore<{ foo: string }>()
		expect(store.currentValue).toBeUndefined()
	})

	it('calls subscriber immediately on subscription', () => {
		const store = new MemoryModelStore<{ foo: string }>()
		const subscriber = vi.fn()
		store.subscribe(subscriber)
		expect(subscriber).toHaveBeenCalledWith(undefined)
	})

	it('updates subscribers when updateSubscribers is called', () => {
		const store = new MemoryModelStore<{ foo: string }>()
		const subscriber = vi.fn()
		store.subscribe(subscriber)

		store.currentValue = { foo: 'bar' }
		store.updateSubscribers()

		expect(subscriber).toHaveBeenCalledTimes(2)
		expect(subscriber).toHaveBeenLastCalledWith({ foo: 'bar' })
	})

	it('removes subscriber when unsubscribing', () => {
		const store = new MemoryModelStore<{ foo: string }>()
		const subscriber = vi.fn()
		const unsubscribe = store.subscribe(subscriber)

		unsubscribe()
		store.currentValue = { foo: 'bar' }
		store.updateSubscribers()

		expect(subscriber).toHaveBeenCalledTimes(1) // Only the initial call
	})

	it('supports multiple subscribers', () => {
		const store = new MemoryModelStore<{ foo: string }>()
		const sub1 = vi.fn()
		const sub2 = vi.fn()

		store.subscribe(sub1)
		store.subscribe(sub2)

		store.currentValue = { foo: 'baz' }
		store.updateSubscribers()

		expect(sub1).toHaveBeenLastCalledWith({ foo: 'baz' })
		expect(sub2).toHaveBeenLastCalledWith({ foo: 'baz' })
	})
})
