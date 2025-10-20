const members = Symbol()

function emptyObject(path: string[], members: symbol) {
	return new Proxy(
		{
			[members]: 0
		} as { [key: string]: unknown; [k: symbol]: number },
		{
			get(target, prop) {
				if (prop in target || typeof prop !== 'string') return prop
				// TODO: Allow for reports back about deletions
				const newObject = emptyObject([...path, prop], members)
				target[prop] = newObject
				;(target[members] as number)++
				return newObject
			},
			set(target, prop, value, receiver) {
				;(target[members] as number)++
				return Reflect.set(target, prop, value, receiver)
			}
		}
	)
}
export function createStoreTree() {
	return emptyObject([], members)
}
