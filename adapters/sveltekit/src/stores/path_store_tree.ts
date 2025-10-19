function emptyObject(path: string[], members: symbol) {
	return new Proxy(
		{
			[members]: 0
		} as { [key: string]: unknown },
		{
			get(target, prop) {
				if (prop in target || typeof prop !== 'string') return prop
				// TODO: Track these creations as increases of members, and
				// allow internal objects to report them back
				const newObject = emptyObject([...path, prop], members)
				target[prop] = newObject
				return newObject
			}
		}
	)
}
export function createStoreTree() {
	const members = Symbol()
	return { tree: emptyObject([], members), members }
}
