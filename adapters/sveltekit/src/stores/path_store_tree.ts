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
	[stores]: SomePathStoreSubscriber[]
}
export class PathStoreTree {
	private rawTree: { [key: string]: TreeAgent } = {}

	public getPathSubscribers(path: ArbitraryPath): SomePathStoreSubscriber[] {
		const pathResult = getProperty(this.rawTree, path)
		if (typeof pathResult !== 'object') return []
		return pathResult[stores]
	}
	public createPathSubscriber(
		path: ArbitraryPath,
		updateFn: SomePathStoreSubscriber
	): symbol {
		const newSubscriberId = Symbol()
		return newSubscriberId
	}
}
