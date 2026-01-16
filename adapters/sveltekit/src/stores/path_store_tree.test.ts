import { beforeEach, describe, expect, it, test, vi } from 'vitest'
import { getProperty } from 'dot-prop'
import { PathStoreTree } from './path_store_tree'
import type { ArbitraryPath } from '@/types/path_stores/ArbitraryPath'

vi.mock('dot-prop', { spy: true })
const getPropertySpy = vi.mocked(getProperty)

const SymbolSpy = vi.spyOn(globalThis, 'Symbol')

beforeEach(() => {
	vi.clearAllMocks()
	SymbolSpy.mockReset()
})

const thePath: readonly [ArbitraryPath[number], ...ArbitraryPath] = [
	'foo',
	4,
	2,
	'bar'
]

it('can be instantiated without errors', () => {
	expect(() => new PathStoreTree()).not.toThrow()
})
describe('use', () => {
	let instance: PathStoreTree
	beforeEach(() => {
		instance = new PathStoreTree()
	})
	describe('createPathSubscriber', () => {
		describe('symbol id', () => {
			it('generates', () => {
				instance.createPathSubscriber(thePath, () => {}, {})
				expect(SymbolSpy).toHaveBeenCalledOnce()
			})
			it('returns', () => {
				const ourSymbol = Symbol()
				SymbolSpy.mockImplementationOnce(() => ourSymbol)
				expect(instance.createPathSubscriber(thePath, () => {}, {})).toBe(
					ourSymbol
				)
			})
		})
		it('creates full path when no segments exist', () => {
			instance.createPathSubscriber(thePath, () => {}, {})

			let previousSegmentReference: // @ts-expect-error we're checking the method's hard work
			| typeof instance.rawTree
				// @ts-expect-error we're checking the method's hard work
				| (typeof instance.rawTree)[string] = instance.rawTree
			expect(Object.keys(previousSegmentReference).length).toBe(1)

			for (const [id, segment] of Object.entries(thePath)) {
				expect(previousSegmentReference).toHaveProperty([segment])
				expect(previousSegmentReference[segment]).toBeTypeOf('object')
				previousSegmentReference = previousSegmentReference[
					segment
					// @ts-expect-error we're checking the method's hard work
				] as (typeof instance.rawTree)[string]

				const allValues = [
					...Object.values(previousSegmentReference),
					...Object.getOwnPropertySymbols(previousSegmentReference).map(
						// @ts-expect-error we're checking the method's hard work
						(sym) => previousSegmentReference[sym]
					)
				]
				expect(allValues).toContain(1)
				expect(allValues.length).toBe(Number(id) === thePath.length - 1 ? 2 : 3)
			}
		})
	})
	describe('getPathSubscribers', () => {
		it('traverses the path with dot-prop', () => {
			instance.getPathSubscribers(thePath)
			expect(getPropertySpy).toHaveBeenCalledOnce()
		})
		it('returns undefined if the path does not exist', () => {
			expect(instance.getPathSubscribers(thePath)).toBeTypeOf('undefined')
		})
		describe('returns an array of subscribers if the path exists', () => {
			for (const subscribersToSupply of [
				[() => {}],
				[() => {}, () => {}, () => {}, () => {}, () => {}],
				[() => {}, () => {}]
			]) {
				test(`${subscribersToSupply.length} members`, () => {
					for (const subscribeFunction of subscribersToSupply)
						instance.createPathSubscriber(thePath, subscribeFunction, {})
					const result = instance.getPathSubscribers(thePath)
					expect(result).toBeTypeOf('object')
					expect(result?.size).toBe(subscribersToSupply.length)
				})
			}
		})
	})
	describe('deletePathSubscriber', () => {
		it('removes a subscriber from the tree', () => {
			const fn = vi.fn()
			const subscriberId = instance.createPathSubscriber(thePath, fn, {})
			expect(instance.getPathSubscribers(thePath)?.size).toBe(1)

			instance.deletePathSubscriber(thePath, subscriberId)
			// The whole branch should be pruned since there are no more subscribers
			expect(instance.getPathSubscribers(thePath)).toBeUndefined()
		})
		it('keeps other subscribers when deleting one from a branch with multiple', () => {
			// Add subscribers to two different paths to ensure the branch isn't pruned
			const fn1 = vi.fn()
			const fn2 = vi.fn()
			const subscriberId1 = instance.createPathSubscriber(thePath, fn1, {})
			// Add a subscriber to a parent path to keep the branch alive
			instance.createPathSubscriber(['foo', 4], fn2, {})

			// Now delete the first one - branch should still exist because of fn2
			instance.deletePathSubscriber(thePath, subscriberId1)
			// The path should still exist
			expect(instance.getPathSubscribers(['foo', 4])?.size).toBe(1)
		})
		it('deletes only the specific subscriber when there are multiple at the same path', () => {
			const fn1 = vi.fn()
			const fn2 = vi.fn()
			const subscriberId1 = instance.createPathSubscriber(thePath, fn1, {})
			const subscriberId2 = instance.createPathSubscriber(thePath, fn2, {})

			expect(instance.getPathSubscribers(thePath)?.size).toBe(2)

			// Delete only the first subscriber
			instance.deletePathSubscriber(thePath, subscriberId1)

			// Should have 1 subscriber remaining
			const remaining = instance.getPathSubscribers(thePath)
			expect(remaining?.size).toBe(1)
			expect(remaining?.has(subscriberId1)).toBe(false)
			expect(remaining?.has(subscriberId2)).toBe(true)
		})
		it('handles corrupted tree during deletion (path segment mismatch)', () => {
			const consoleError = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {})
			
			// Create a subscriber
			const subscriberId = instance.createPathSubscriber(['a', 'b'], () => {}, {})
			
			// Manually corrupt the tree by deleting a segment in the middle
			// @ts-expect-error Accessing private for corruption
			delete instance.rawTree['a']
			
			// Try to delete the subscriber - should trigger the brandedLog error
			instance.deletePathSubscriber(['a', 'b'], subscriberId)
			
			expect(consoleError).toHaveBeenCalled()
			consoleError.mockRestore()
		})
	})
	describe('pushUpdateThroughPath', () => {
		it('updates subscribers along the path', () => {
			const memoryModel = {
				foo: {
					4: {
						2: {
							bar: 'hello'
						}
					}
				}
			}
			const fn = vi.fn()
			instance.createPathSubscriber(thePath, fn, memoryModel)
			fn.mockClear()

			instance.pushUpdateThroughPath(['foo', 4, 2, 'bar'], memoryModel)
			expect(fn).toHaveBeenCalledWith('hello')
		})
		it('returns early for non-existent path', () => {
			const fn = vi.fn()
			instance.createPathSubscriber(thePath, fn, {})
			fn.mockClear()

			instance.pushUpdateThroughPath(['nonexistent'], {})
			expect(fn).not.toHaveBeenCalled()
		})
		it('updates nested stores recursively', () => {
			const memoryModel = {
				a: {
					b: {
						c: 'value'
					}
				}
			}
			const fnA = vi.fn()
			const fnB = vi.fn()
			const fnC = vi.fn()
			instance.createPathSubscriber(['a'], fnA, memoryModel)
			instance.createPathSubscriber(['a', 'b'], fnB, memoryModel)
			instance.createPathSubscriber(['a', 'b', 'c'], fnC, memoryModel)
			fnA.mockClear()
			fnB.mockClear()
			fnC.mockClear()

			// Push update from root - should update all nested stores
			instance.pushUpdateThroughPath([], memoryModel)
			expect(fnA).toHaveBeenCalledWith({ b: { c: 'value' } })
			expect(fnB).toHaveBeenCalledWith({ c: 'value' })
			expect(fnC).toHaveBeenCalledWith('value')
		})
		it('handles undefined nested values', () => {
			const memoryModel = { a: { b: 'exists' } }
			const fn = vi.fn()
			// Create a subscriber for a.c which doesn't exist
			instance.createPathSubscriber(['a'], fn, memoryModel)
			fn.mockClear()

			instance.pushUpdateThroughPath(['a'], memoryModel)
			expect(fn).toHaveBeenCalledWith({ b: 'exists' })
		})
		it('handles subscriber errors gracefully', () => {
			const memoryModel = { a: { b: 'exists' } }
			const throwingFn = vi.fn().mockImplementation(() => {
				throw new Error('Subscriber error')
			})
			const normalFn = vi.fn()
			instance.createPathSubscriber(['a'], throwingFn, memoryModel)
			instance.createPathSubscriber(['a', 'b'], normalFn, memoryModel)
			throwingFn.mockClear()
			normalFn.mockClear()

			// Should not throw even though throwingFn throws
			expect(() =>
				instance.pushUpdateThroughPath(['a'], memoryModel)
			).not.toThrow()
			expect(throwingFn).toHaveBeenCalled()
			expect(normalFn).toHaveBeenCalled()
		})
		it('handles undefined values in nested updates when parent is null', () => {
			const memoryModel = { a: null }
			const fn = vi.fn()
			instance.createPathSubscriber(['a', 'b'], fn, {})
			fn.mockClear()

			instance.pushUpdateThroughPath([], memoryModel)
			// fn should be called with undefined because a is null so a.b doesn't exist
			expect(fn).toHaveBeenCalledWith(undefined)
		})
		it('handles undefined values in nested updates when key does not exist', () => {
			const memoryModel = { a: { c: 'value' } }
			const fn = vi.fn()
			instance.createPathSubscriber(['a', 'b'], fn, {})
			fn.mockClear()

			// Update the tree from the root
			instance.pushUpdateThroughPath([], memoryModel)
			// fn should be called with undefined because a.b doesn't exist
			expect(fn).toHaveBeenCalledWith(undefined)
		})
		it('handles undefined values when previousOriginal is not an object', () => {
			const memoryModel = { a: 'string_value' }
			const fn = vi.fn()
			instance.createPathSubscriber(['a', 'b'], fn, {})
			fn.mockClear()

			// Push update through path where 'a' is a string, not an object
			instance.pushUpdateThroughPath(['a', 'b'], memoryModel)
			// fn should be called with undefined because 'a' is not an object
			expect(fn).toHaveBeenCalledWith(undefined)
		})
	})
	describe('updateAllNestedStores', () => {
		it('handles subscriber errors gracefully in recursive updates', () => {
			const memoryModel = { a: { b: { c: 'value' } } }
			const throwingFn = vi.fn().mockImplementation(() => {
				throw new Error('Subscriber error')
			})
			instance.createPathSubscriber(['a', 'b'], throwingFn, memoryModel)
			throwingFn.mockClear()

			// Should not throw even though the subscriber throws
			expect(() =>
				instance.pushUpdateThroughPath([], memoryModel)
			).not.toThrow()
			expect(throwingFn).toHaveBeenCalled()
		})
	})
})
