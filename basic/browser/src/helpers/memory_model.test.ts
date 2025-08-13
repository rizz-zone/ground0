import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryModel } from './memory_model'
import type { Transformation } from '@/types/memory_model/Tranformation'
import { TransformationAction } from '@/types/memory_model/TransformationAction'

const structuredCloneMock = vi.spyOn(globalThis, 'structuredClone')
const consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
const announceTransition = vi.fn()

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
		type StrangeInitial = { initial?: StrangeInitial }
		const initial: StrangeInitial = {}
		initial.initial = initial
		const proxy = createMemoryModel(initial, announceTransition)
		expect(consoleWarnMock).toHaveBeenCalledOnce()

		// @ts-expect-error We're doing this to see if 10 can still be reassigned.
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		proxy.initial!.initial!.initial!.initial!.initial!.initial! = 10
		expect(proxy.initial).toBe(10)
		expect(announceTransition).toHaveBeenCalledOnce()
	})
})

describe('traps', () => {
	describe('transition submissions', () => {
		describe('set', () => {
			it('triggers on normal value assignment', () => {
				const proxy = createMemoryModel(
					{
						abc: 123,
						myNested: {
							foo: 'bar',
							l: new Date(),
							more: 53n
						}
					},
					announceTransition
				)
				expect(announceTransition).not.toHaveBeenCalled()

				proxy.abc = 1024
				expect(announceTransition).toHaveBeenCalledExactlyOnceWith({
					action: TransformationAction.Set,
					path: ['abc'],
					newValue: 1024
				} satisfies Transformation)
				announceTransition.mockClear()

				proxy.myNested.foo = 'newBar'
				expect(announceTransition).toHaveBeenCalledExactlyOnceWith({
					action: TransformationAction.Set,
					path: ['myNested', 'foo'],
					newValue: 'newBar'
				} satisfies Transformation)
			})
			it('triggers and creates reactive proxies on normal object assignment', () => {
				const proxy: {
					abc: number
					myNested: object
				} = createMemoryModel(
					{
						abc: 123,
						myNested: {
							foo: 'bar',
							l: new Date(),
							more: 53n
						}
					},
					announceTransition
				)

				proxy.myNested = {
					foo: 'anotherBar'
				}
				expect(announceTransition).toHaveBeenCalledOnce()
				// expect(announceTransition.arguments)
			})
		})
	})
})
