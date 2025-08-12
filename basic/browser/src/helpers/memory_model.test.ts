import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryModel } from './memory_model'

const structuredCloneMock = vi.spyOn(globalThis, 'structuredClone')
const consoleWarnMock = vi.spyOn(console, 'warn')

describe('init', () => {
	afterEach(vi.clearAllMocks)
	it('makes a structured clone', () => {
		const objectThatWouldTripUp = {
			foo: 'bar',
			nest: { nestedFoo: 'nested bar!!!' }
		}
		createMemoryModel(objectThatWouldTripUp, () => {})
		expect(structuredCloneMock).toHaveBeenCalledExactlyOnceWith(
			objectThatWouldTripUp
		)
	})
	it('creates a proxy per object', () => {
		const announceTransition = vi.fn()
		const proxy = createMemoryModel(
			{
				foo: 'bar',
				nest: { nestedFoo: 'nested bar!!!', array1: [34, 5e3, 0x3899] },
				array1: [3498234, 5e3, 0x3899]
			},
			announceTransition
		)

		proxy.nest.array1[2] = 10
		proxy.nest.nestedFoo = 'nestedBar'
		proxy.array1[0] = 1
		proxy.foo = 'new'

		// If everything is normal, all of these objects had a proxy associated
		// with them, so a transition was announced.
		expect(announceTransition).toHaveBeenCalledTimes(4)
	})
	it('supports (but warns upon) circular references', () => {
		const announceTransition = vi.fn()
		type StrangeInitial = { initial?: StrangeInitial }
		const initial: StrangeInitial = {}
		initial.initial = initial
		const proxy = createMemoryModel(initial, announceTransition)
		expect(consoleWarnMock).toHaveBeenCalledOnce()

		// @ts-expect-error We're doing this to see if 10 can still be reassigned.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		proxy.initial!.initial!.initial!.initial!.initial!.initial! = 10
		expect(proxy.initial).toBe(10)
	})
})
