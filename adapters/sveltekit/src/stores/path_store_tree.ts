import { brandedLog } from '@/common/branded_log'
import type { ArbitraryPath } from '@/types/path_stores/ArbitraryPath'
import type { PathValue } from '@/types/path_stores/values/PathValue'
import { getProperty } from 'dot-prop'

const members = Symbol()
const stores = Symbol()

type SomePathStoreSubscriber = (
	newValue: PathValue<never, never> | undefined
) => unknown
type TreeAgent = {
	[key: string]: TreeAgent
	[members]: number
	[stores]: Map<symbol, SomePathStoreSubscriber>
}
type PopulatedArbitraryPath = readonly [ArbitraryPath[number], ...ArbitraryPath]

export class PathStoreTree {
	private rawTree: { [key: string]: TreeAgent } = {}

	public getPathSubscribers(
		path: PopulatedArbitraryPath
	): Map<symbol, SomePathStoreSubscriber> | undefined {
		const pathResult = getProperty(this.rawTree, path)
		if (typeof pathResult !== 'object') return
		return pathResult[stores]
	}
	public createPathSubscriber(
		path: PopulatedArbitraryPath,
		updateFn: SomePathStoreSubscriber,
		latestMemoryModel: { [key: string | number]: unknown }
	): symbol {
		const newSubscriberId = Symbol()

		// Navigate the tree. This is done manually instead of using dot-prop
		// because we want to create any references down the path that don't
		// exist yet.
		let previousSegmentReference: typeof this.rawTree | TreeAgent = this.rawTree
		for (const pathSegment of path) {
			if (
				!(pathSegment in previousSegmentReference) ||
				typeof previousSegmentReference[pathSegment] === 'undefined'
			) {
				previousSegmentReference[pathSegment] = {
					[members]: 1,
					[stores]: new Map()
				}
				previousSegmentReference = previousSegmentReference[pathSegment]
				continue
			}
			const reference = previousSegmentReference[pathSegment] as TreeAgent
			reference[members]++
			previousSegmentReference = reference
		}

		// previousSegmentReference is now also the final one, so we can add
		// the subscriber to it and return the ID.
		;(previousSegmentReference as TreeAgent)[stores].set(
			newSubscriberId,
			updateFn
		)

		try {
			updateFn(getProperty(latestMemoryModel, path))
		} catch {
			// empty
		}

		return newSubscriberId
	}
	public deletePathSubscriber(
		path: PopulatedArbitraryPath,
		subscriberId: symbol
	): void {
		let previous: typeof this.rawTree | TreeAgent = this.rawTree

		for (const [index, pathSegment] of path.entries()) {
			if (
				!(pathSegment in previous) ||
				typeof previous[pathSegment] !== 'object'
			)
				return brandedLog(
					console.error,
					'Path could not fully be resolved while deleting store subscriber, which may mean the store tree is now corrupted:',
					path,
					'\n\nFailed at',
					pathSegment
				)
			const item: TreeAgent = previous[pathSegment]
			if (--item[members] <= 0) {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete previous[pathSegment]
				return
			}
			if (index === path.length - 1) {
				item[stores].delete(subscriberId)
			}
			previous = item
		}
	}

	private updateAllNestedStores(
		treeNode: TreeAgent,
		value: unknown,
		update: boolean
	): void {
		// Update all current node's subscribers
		if (update)
			for (const fn of treeNode[stores].values()) {
				try {
					fn(value as PathValue<never, never> | undefined)
				} catch {
					// empty
				}
			}
		// Then recursively update all children
		for (const key of Object.keys(treeNode)) {
			// Only look at object children that could represent path nodes (not symbols like 'stores' or 'members')
			if (
				typeof key === 'string' &&
				typeof treeNode[key] === 'object' &&
				key !== members.toString() &&
				key !== stores.toString()
			) {
				// For the value: if value is an object and has key, pass it, otherwise pass undefined
				const nextValue =
					typeof value === 'object' && value !== null && key in value
						? (value as { [k: string]: unknown })[key]
						: undefined
				this.updateAllNestedStores(treeNode[key], nextValue, true)
			}
		}
	}

	public pushUpdateThroughPath(
		path: ArbitraryPath,
		latestMemoryModel: { [key: string | number]: unknown }
	): void {
		let previousOriginal: unknown = latestMemoryModel
		let previousTree: TreeAgent | typeof this.rawTree = this.rawTree
		for (const pathSegment of path) {
			if (
				!(pathSegment in previousTree) ||
				typeof previousTree[pathSegment] !== 'object'
			)
				return
			const thisTree = previousTree[
				pathSegment
			] satisfies TreeAgent as TreeAgent
			const thisOriginal =
				typeof previousOriginal === 'object' &&
				previousOriginal !== null &&
				pathSegment in previousOriginal
					? (previousOriginal as { [key: string | number]: unknown })[
							pathSegment
						]
					: undefined
			for (const fn of thisTree[stores].values()) {
				try {
					fn(thisOriginal as PathValue<never, never> | undefined)
				} catch {
					// empty
				}
			}
			previousTree = thisTree
			previousOriginal = thisOriginal
		}
		// Now that we're at the final segment, recurse from this point down to
		// guarantee anything else that may have been impacted is updated.
		if (typeof previousTree === 'object' && previousTree !== null) {
			this.updateAllNestedStores(
				previousTree as TreeAgent,
				previousOriginal,
				false
			)
		}
	}
}
