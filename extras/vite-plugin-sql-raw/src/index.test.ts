import { describe, expect, it } from 'vitest'
import vitePluginSqlRaw from '.'

describe('vite-plugin-sql-raw', () => {
	it('is function', () => {
		expect(vitePluginSqlRaw).toBeTypeOf('function')
	})

	it('returns a plugin object', () => {
		const plugin = vitePluginSqlRaw<{ name: string; enforce: string }>()
		expect(plugin).toBeTypeOf('object')
		expect(plugin.name).toBe('vite-plugin-sql-raw')
		expect(plugin.enforce).toBe('pre')
	})

	describe('transform', () => {
		const plugin = vitePluginSqlRaw<{
			transform: (code: string, id: string) => string | undefined
		}>()

		it('transforms .sql files', () => {
			const code = 'SELECT * FROM users;'
			const result = plugin.transform(code, 'query.sql')
			expect(result).toBe('export default `SELECT * FROM users;`;')
		})

		it('escapes backticks in SQL content', () => {
			const code = "SELECT `id`, `name` FROM users WHERE name = 'test';"
			const result = plugin.transform(code, 'query.sql')
			expect(result).toBe(
				"export default `SELECT \\`id\\`, \\`name\\` FROM users WHERE name = 'test';`;"
			)
		})

		it('returns undefined for non-.sql files', () => {
			const code = 'const x = 1;'
			const result = plugin.transform(code, 'file.ts')
			expect(result).toBeUndefined()
		})

		it('returns undefined for .sql-like files that do not end with .sql', () => {
			const code = 'SELECT * FROM users;'
			const result = plugin.transform(code, 'query.sql.bak')
			expect(result).toBeUndefined()
		})
	})
})
