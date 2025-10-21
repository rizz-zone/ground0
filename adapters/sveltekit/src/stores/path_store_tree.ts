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
				break
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
		updateFn: SomePathStoreSubscriber
	): void {
		const references: TreeAgent[] = []

		// We need to get all the references along the path so that we can
		// decrement members from inside out, starting with the actually
		// affected object.
		// TODO: Maybe this is unnecessary? Though it seems like it still would
		// be more efficient (not duplicating how many times we access it
		// by redoing the work dot-prop would otherwise have to do)
		for (const pathSegment of path) {
			const previous = references.at(-1) ?? this.rawTree
			// If what we're looking for doesn't exist, we don't have to continue.
			if (
				!(pathSegment in previous) ||
				typeof previous[pathSegment] !== 'object'
			)
				return
			references.push(previous[pathSegment])
		}
	}
	public pushUpdateThroughPath(
		path: PopulatedArbitraryPath,
		latestMemoryModel: object
	): void {
		// TODO: This will update any subscriber functions present from the
		// outside in.
	}
}
