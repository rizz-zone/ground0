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
})
