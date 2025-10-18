import { expect, it } from 'vitest'
import { FalseProperty } from './false_property'

it('has no properties', () => {
	expect(Object.keys(new FalseProperty()).length).toBe(0)
})
