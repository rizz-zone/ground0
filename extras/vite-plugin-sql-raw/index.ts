export default function <T>(): T {
	return {
		name: 'vite-plugin-sql-raw',
		enforce: 'pre',
		transform(code, id) {
			if (id.endsWith('.sql')) {
				return `export default \`${code.replaceAll('`', '\\`')}\`;`
			}
		}
	}
}
