import { brandedLog } from '@/common/branded_log'
import type { ArbitraryPath } from '@/types/path_stores/ArbitraryPath'
import type { PathValue } from '@/types/path_stores/values/PathValue'
import { getProperty } from 'dot-prop'

const members = Symbol()
const stores = Symbol()

function emptyObject(
	path: string[],
	members: symbol,
	reportEmpty?: () => unknown
) {
	return new Proxy(
		{
			[members]: 0
		} as { [key: string]: unknown; [k: symbol]: number },
		{
			get(target, prop) {
				if (prop in target || typeof prop !== 'string')
					return Reflect.get(target, prop)
				const newObject = emptyObject([...path, prop], members, () => {
					;(target[members] as number)--
					Reflect.deleteProperty(target, prop)
					if ((target[members] as number) <= 0) reportEmpty?.()
				})
				target[prop] = newObject
				;(target[members] as number)++
				return newObject
			},
			set(target, prop, value, receiver) {
				const success = Reflect.set(target, prop, value, receiver)
				if (success) (target[members] as number)++
				return success
			},
			deleteProperty(target, prop) {
				const success = Reflect.deleteProperty(target, prop)
				if (success) {
					;(target[members] as number)--
					if ((target[members] as number) <= 0) reportEmpty?.()
				}
				return success
			}
		}
	)
}
export function createStoreTree() {
	return emptyObject([], members)
}

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
		updateFn: SomePathStoreSubscriber
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
		return newSubscriberId
	}
	public deletePathSubscriber(
		path: PopulatedArbitraryPath,
		subscriberId: symbol
	): void {
		const finalIndex = path.length
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
			if (index === finalIndex) {
				item[stores].delete(subscriberId)
			}
			previous = item
		}
	}
	public pushUpdateThroughPath(
		path: PopulatedArbitraryPath,
		latestMemoryModel: { [key: string | number]: unknown }
	): void {
		// TODO: This will update any subscriber functions present from the
		// outside in.
	}
}
