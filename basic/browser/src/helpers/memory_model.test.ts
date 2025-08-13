import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryModel } from './memory_model'
import type { Transformation } from '@/types/memory_model/Tranformation'
import { TransformationAction } from '@/types/memory_model/TransformationAction'

const structuredCloneMock = vi.spyOn(globalThis, 'structuredClone')
const consoleWarnMock = vi.spyOn(console, 'warn').mockImplementation(() => {})
const announceTransition = vi.fn()
afterEach(vi.clearAllMocks)

describe('init', () => {
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

				expect(consoleWarnMock).not.toHaveBeenCalled()
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
				announceTransition.mockClear()

				// @ts-expect-error we don't care
				proxy.myNested.foo = '3'
				expect(announceTransition).toHaveBeenCalledExactlyOnceWith({
					action: TransformationAction.Set,
					path: ['myNested', 'foo'],
					newValue: '3'
				} satisfies Transformation)

				expect(consoleWarnMock).not.toHaveBeenCalled()
			})
			it('triggers when prototype methods are used', () => {
				const proxy = createMemoryModel(
					{
						someArray: [0, 1, 2, 65, 9]
					},
					announceTransition
				)
				proxy.someArray.push(2)
				expect(announceTransition).toHaveBeenCalledTimes(2)

				expect(consoleWarnMock).not.toHaveBeenCalled()
			})
		})
		describe('delete', () => {
			it('triggers for regular properties', () => {
				const proxy: {
					abc?: number
					myNested: object & { foo?: string }
				} = createMemoryModel(
					{
						abc: 123,
						myNested: {
							foo: 'bar',
							more: 53n
						}
					},
					announceTransition
				)

				delete proxy.abc
				expect(announceTransition).toHaveBeenCalledExactlyOnceWith({
					action: TransformationAction.Delete,
					path: ['abc']
				} satisfies Transformation)
				expect(proxy).toMatchObject({
					myNested: {
						foo: 'bar',
						more: 53n
					}
				})
				announceTransition.mockClear()

				delete proxy.myNested.foo
				expect(announceTransition).toHaveBeenCalledExactlyOnceWith({
					action: TransformationAction.Delete,
					path: ['myNested', 'foo']
				} satisfies Transformation)
				expect(proxy).toMatchObject({
					myNested: {
						more: 53n
					}
				})

				expect(consoleWarnMock).not.toHaveBeenCalled()
			})
			it('triggers for proxies', () => {
				const proxy: {
					abc: 123
					myNested?: {
						foo: 'bar'
						more: 53n
						moreNested?: object
					}
				} = createMemoryModel(
					{
						abc: 123,
						myNested: {
							foo: 'bar',
							more: 53n,
							moreNested: {}
						}
					},
					announceTransition
				)

				delete proxy.myNested?.moreNested
				expect(announceTransition).toHaveBeenCalledExactlyOnceWith({
					action: TransformationAction.Delete,
					path: ['myNested', 'moreNested']
				} satisfies Transformation)
				expect(proxy).toMatchObject({
					abc: 123,
					myNested: {
						foo: 'bar',
						more: 53n
					}
				})
				announceTransition.mockClear()

				delete proxy.myNested
				expect(announceTransition).toHaveBeenCalledExactlyOnceWith({
					action: TransformationAction.Delete,
					path: ['myNested']
				} satisfies Transformation)
				expect(proxy).toMatchObject({
					abc: 123
				})

				expect(consoleWarnMock).not.toHaveBeenCalled()
			})
		})
	})
	it('warns on defineProperty', () => {
		const proxy = createMemoryModel(
			{
				abc: 123,
				myNested: {
					foo: 'bar',
					more: 53n
				}
			},
			announceTransition
		)
		expect(consoleWarnMock).not.toHaveBeenCalled()

		Object.defineProperty(proxy.myNested, 'a', { value: 10 })
		expect(consoleWarnMock).toHaveBeenCalledOnce()

		Object.defineProperty(proxy, 'a', { value: 10 })
		expect(consoleWarnMock).toHaveBeenCalledTimes(2)
	})
	it('warns on preventExtensions', () => {
		const proxy = createMemoryModel(
			{
				abc: 123,
				myNested: {
					foo: 'bar',
					more: 53n
				}
			},
			announceTransition
		)
		expect(consoleWarnMock).not.toHaveBeenCalled()

		Object.preventExtensions(proxy.myNested)
		expect(consoleWarnMock).toHaveBeenCalledOnce()

		Object.preventExtensions(proxy)
		expect(consoleWarnMock).toHaveBeenCalledTimes(2)
	})
})
