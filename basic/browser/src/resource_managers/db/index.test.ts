import {
	DownstreamDbWorkerMessageType,
	type DownstreamDbWorkerMessage
} from '@/types/internal_messages/DownstreamDbWorkerMessage'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import type { LocalDatabase } from '@ground0/shared'
import { migrations } from '@ground0/shared/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbThinClient as DbThinClientType } from './'

const TIMEOUT_NUMBER = 23443
const setTimeoutMock = vi.spyOn(globalThis, 'setTimeout')
const clearTimeoutMock = vi.spyOn(globalThis, 'clearTimeout')

const syncResources = vi.fn()
const inputs = {
	syncResources,
	migrations,
	dbName: 'kevin'
} as const as ConstructorParameters<typeof DbThinClient>[0]

beforeEach(() => {
	vi.clearAllMocks()
	setTimeoutMock.mockImplementation(
		() => TIMEOUT_NUMBER as unknown as ReturnType<typeof setTimeout>
	)
	clearTimeoutMock.mockImplementation(() => {})
})

const { DbThinClient } = await import('./')

describe('init', () => {
	describe('constructor', () => {
		it('sets migrations to provided migrations', () => {
			const client = new DbThinClient(inputs)
			// @ts-expect-error For this test, we want to access the private member
			expect(client.migrations).toBe(migrations)
		})
		it('sets dbName to provided dbName', () => {
			const client = new DbThinClient(inputs)
			// @ts-expect-error For this test, we want to access the private member
			expect(client.dbName).toBe(inputs.dbName)
		})
		it('sets syncDbResource to method that calls syncResources and sets local status copy', () => {
			const client = new DbThinClient(inputs)
			// @ts-expect-error We are testing the private method
			const { syncDbResource } = client
			expect(syncResources).not.toHaveBeenCalled()
			// @ts-expect-error We are testing with the private value
			expect(client.status).toBe(DbResourceStatus.Disconnected)
			for (const [index, syncValue] of Object.entries([
				{
					status: DbResourceStatus.ConnectedAndMigrated,
					instance: {} as LocalDatabase
				},
				{ status: DbResourceStatus.NeverConnecting }
			] satisfies ResourceBundle['db'][])) {
				syncDbResource(syncValue)
				expect(syncResources).toHaveBeenNthCalledWith(Number(index) + 1, {
					db: syncValue
				} satisfies Partial<ResourceBundle>)
				// @ts-expect-error We are testing the private value
				expect(client.status).toBe(syncValue.status)
			}
		})
	})
	describe('neverConnectingTimeout', () => {
		it('is created with setTimeout', () => {
			expect(setTimeoutMock).not.toHaveBeenCalled()
			// @ts-expect-error We are testing the private value
			const { neverConnectingTimeout } = new DbThinClient(inputs)
			expect(setTimeoutMock).toHaveBeenCalledOnce()
			expect(neverConnectingTimeout).toBe(TIMEOUT_NUMBER)
		})
		it('sets db status to DbResourceStatus.NeverConnecting if complete', ({
			skip
		}) => {
			const client = new DbThinClient(inputs)
			const syncDbResource = vi
				.spyOn(client, 'syncDbResource' as keyof typeof client)
				.mockImplementation(() => {})
			const callback = setTimeoutMock.mock.lastCall?.[0]
			if (!callback) return skip()
			expect(syncDbResource).not.toHaveBeenCalled()
			callback()
			expect(syncDbResource).toHaveBeenCalledExactlyOnceWith({
				status: DbResourceStatus.NeverConnecting
			} satisfies ResourceBundle['db'])
		})
	})
})
describe('newPort', () => {
	it('closes old port if present', () => {
		const client = new DbThinClient(inputs)
		const close = vi.fn()
		// @ts-expect-error We are testing how the class manages this private
		// value
		client.port = { close } as unknown as MessagePort
		expect(close).not.toHaveBeenCalled()
		client.newPort({} as MessagePort)
		expect(close).toHaveBeenCalledExactlyOnceWith()
	})
	describe('sets port member to new port when it is currently', () => {
		it('undefined', () => {
			const client = new DbThinClient(inputs)
			// @ts-expect-error We are testing how the class manages this private
			// value
			expect(client.port).toBeUndefined()
			const newPort = {} as MessagePort
			client.newPort(newPort)
			// @ts-expect-error We are testing how the class manages this private
			// value
			expect(client.port).toBe(newPort)
		})
		it('an old port', () => {
			const client = new DbThinClient(inputs)
			const oldPort = { close: () => {} } as MessagePort
			// @ts-expect-error We are testing how the class manages this
			// private value
			client.port = oldPort
			// @ts-expect-error We are testing how the class manages this
			// private value
			expect(client.port).toBe(oldPort)
			const newPort = {} as MessagePort
			client.newPort(newPort)
			// @ts-expect-error We are testing how the class manages this
			// private value
			expect(client.port).toBe(newPort)
		})
	})
	describe('onmessage', () => {
		it('is set', () => {
			const client = new DbThinClient(inputs)
			const port = {} as MessagePort
			client.newPort(port)
			expect(port.onmessage).toBeTypeOf('function')
		})
		it('gracefully handles when called despite a new port', () => {
			const client = new DbThinClient(inputs)
			const port = {} as MessagePort
			client.newPort(port)
			expect(port.onmessage).toBeTypeOf('function')
			// @ts-expect-error This avoids the checks that should normally not
			// allow a situation like this to happen
			client.port = {} as MessagePort
			expect(() =>
				port.onmessage?.(new MessageEvent('message', { data: {} }))
			).not.toThrow()
		})
		describe('message handling', ({ skip }) => {
			let onmessage: (
				ev: MessageEvent<DownstreamDbWorkerMessage>
			) => unknown = () => undefined
			let client: DbThinClientType
			beforeEach(() => {
				client = new DbThinClient(inputs)
				const port = {} as MessagePort
				client.newPort(port)
				if (!('onmessage' in port) || typeof port.onmessage !== 'function')
					return skip('newPort is not setting onmessage')
				onmessage = port.onmessage.bind(port)
			})
			describe('NotConnecting', () => {
				it('sets port member to undefined', () => {
					// @ts-expect-error We are testing how the class manages
					// this private value
					expect(client.port).not.toBeUndefined()
					onmessage(
						new MessageEvent<DownstreamDbWorkerMessage>('message', {
							data: { type: DownstreamDbWorkerMessageType.NotConnecting }
						})
					)
					// @ts-expect-error We are testing how the class manages
					// this private value
					expect(client.port).toBeUndefined()
				})
			})
			describe('Ready', () => {
				it('clears neverConnectingTimeout', () => {
					expect(clearTimeoutMock).not.toHaveBeenCalled()
					onmessage(
						new MessageEvent<DownstreamDbWorkerMessage>('message', {
							data: { type: DownstreamDbWorkerMessageType.Ready }
						})
					)
					expect(clearTimeoutMock).toHaveBeenCalledExactlyOnceWith(
						TIMEOUT_NUMBER
					)
				})
				describe('when status is currently', () => {
					describe('Disconnected', () => {
						it('starts a migration', () => {})
					})
				})
			})
		})
	})
})
