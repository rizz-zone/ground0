import { expect, it } from 'vitest'
import vitePluginSqlRaw from '.'

it('is function', () => {
	expect(vitePluginSqlRaw).toBeTypeOf('function')
})
