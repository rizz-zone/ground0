/* v8 ignore start */
// this entire file is terrible and we do not talk about it. works well enough

const getCallerPath = () => {
	const _prepare = Error.prepareStackTrace
	Error.prepareStackTrace = (_, stack) => stack
	// @ts-expect-error This is cursed
	const stack = new Error().stack.slice(1)
	Error.prepareStackTrace = _prepare
	// @ts-expect-error This is also cursed
	const filePath: string = stack[1]?.getFileName()
	if (!filePath) throw new Error('no file path')

	const url = new URL(`file://${filePath}`)
	url.pathname = url.pathname.replace(/\/[^/]+$/, '/')
	return url
}

let counter = 0
export const importUnique = (path: string) => {
	counter++
	return import(`${new URL(path, getCallerPath())}?n=${counter}`)
}
