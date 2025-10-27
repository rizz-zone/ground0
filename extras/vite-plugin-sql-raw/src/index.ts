const plugin = {
	name: 'vite-plugin-sql-raw',
	enforce: 'pre',
	transform(code: string, id: string) {
		if (id.endsWith('.sql')) {
			return `export default \`${code.replaceAll('`', '\\`')}\`;`
		}
	}
}

export default function <T>(): T {
	return plugin as T
}
