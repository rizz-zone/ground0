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

const migrateThen = vi.fn()
const migrate = vi.fn()
vi.doMock('./migrate', () => ({ migrate }))

const brandedLog = vi.fn()
vi.doMock('@/common/branded_log', () => ({ brandedLog }))

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
	migrate.mockImplementation(() => ({ then: migrateThen }))
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
			describe('Ready, when status is currently', () => {
				describe('Disconnected', () => {
					beforeEach(() => {
						// @ts-expect-error We want to ensure that it is
						// Disconnected even if the impl changes here
						// eventually for some reason
						client.status = DbResourceStatus.Disconnected
					})
					it('starts a migration', () => {
						expect(migrate).not.toHaveBeenCalled()
						onmessage(
							new MessageEvent<DownstreamDbWorkerMessage>('message', {
								data: { type: DownstreamDbWorkerMessageType.Ready }
							})
						)
						expect(migrate).toHaveBeenCalledExactlyOnceWith(
							// @ts-expect-error We don't mock the drizzle
							// proxy (though that might be a good idea)
							client.db,
							inputs.migrations
						)
					})
					it('provides both an onfulfilled and onrejected handler', () => {
						onmessage(
							new MessageEvent<DownstreamDbWorkerMessage>('message', {
								data: { type: DownstreamDbWorkerMessageType.Ready }
							})
						)
						expect(migrateThen).toHaveBeenCalledOnce()
						const thenCall = migrateThen.mock.lastCall as
							| Parameters<Promise<never>['then']>
							| undefined
						if (!thenCall) expect.fail()
						expect(thenCall[0]).toBeTypeOf('function')
						expect(thenCall[1]).toBeTypeOf('function')
					})
					it('syncs as connected and clears neverConnectingTimeout once the migration is complete', ({
						skip
					}) => {
						const syncDbResource = vi
							.spyOn(client, 'syncDbResource' as keyof typeof client)
							.mockImplementation(() => {})
						onmessage(
							new MessageEvent<DownstreamDbWorkerMessage>('message', {
								data: { type: DownstreamDbWorkerMessageType.Ready }
							})
						)
						const thenCall = migrateThen.mock.lastCall as
							| Parameters<Promise<void>['then']>
							| undefined
						if (!thenCall || typeof thenCall[0] !== 'function') return skip()

						expect(syncDbResource).not.toHaveBeenCalled()
						expect(clearTimeoutMock).not.toHaveBeenCalled()
						thenCall[0]()
						expect(syncDbResource).toHaveBeenCalledExactlyOnceWith({
							status: DbResourceStatus.ConnectedAndMigrated,
							// @ts-expect-error We don't mock the drizzle
							// proxy (though that might be a good idea)
							instance: client.db
						} satisfies ResourceBundle['db'])
						expect(clearTimeoutMock).toHaveBeenCalledExactlyOnceWith(
							TIMEOUT_NUMBER
						)
					})
					it('calls brandedLog on rejection', ({ skip }) => {
						onmessage(
							new MessageEvent<DownstreamDbWorkerMessage>('message', {
								data: { type: DownstreamDbWorkerMessageType.Ready }
							})
						)
						const thenCall = migrateThen.mock.lastCall as
							| Parameters<Promise<void>['then']>
							| undefined
						if (!thenCall || typeof thenCall[1] !== 'function') return skip()

						const theSecret = crypto.randomUUID()
						const initialLength = brandedLog.mock.calls.length

						thenCall[1](theSecret)

						expect(initialLength + 1).toBe(brandedLog.mock.calls.length)
						const brandedLogCall = brandedLog.mock.lastCall
						expect(brandedLogCall).toBeDefined()
						if (!brandedLogCall) expect.fail()
						expect(brandedLogCall).toContain(theSecret)
					})
					it('calls brandedLog on error', () => {
						const error = new Error()
						migrate.mockImplementation(() => {
							throw error
						})
						onmessage(
							new MessageEvent<DownstreamDbWorkerMessage>('message', {
								data: { type: DownstreamDbWorkerMessageType.Ready }
							})
						)

						const brandedLogCall = brandedLog.mock.lastCall
						expect(brandedLogCall).toBeDefined()
						if (!brandedLogCall) expect.fail()
						expect(brandedLogCall).toContain(error)
					})
					it('will not migrate twice', () => {
						for (let i = 0; i <= 1; i++)
							onmessage(
								new MessageEvent<DownstreamDbWorkerMessage>('message', {
									data: { type: DownstreamDbWorkerMessageType.Ready }
								})
							)
						expect(migrate).toHaveBeenCalledOnce()
					})
				})
			})
		})
	})
})
