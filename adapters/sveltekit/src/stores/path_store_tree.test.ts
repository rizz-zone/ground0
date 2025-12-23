import { beforeEach, describe, expect, it, test, vi } from 'vitest'
import { getProperty } from 'dot-prop'
import { PathStoreTree } from './path_store_tree'
import type { ArbitraryPath } from '@/types/path_stores/ArbitraryPath'

vi.mock('dot-prop', { spy: true })
const getPropertySpy = vi.mocked(getProperty)

beforeEach(vi.clearAllMocks)

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
