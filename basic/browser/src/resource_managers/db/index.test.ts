import {
	DownstreamDbWorkerMessageType,
	type DownstreamDbWorkerMessage
} from '@/types/internal_messages/DownstreamDbWorkerMessage'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import type { LocalDatabase } from '@ground0/shared'
import { migrations } from '@ground0/shared/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbThinClient as DbThinClientType } from './'
import {
	UpstreamDbWorkerMessageType,
	type UpstreamDbWorkerMessage
} from '@/types/internal_messages/UpstreamDbWorkerMessage'

const TIMEOUT_NUMBER = 23443
const setTimeoutMock = vi.spyOn(globalThis, 'setTimeout')
const clearTimeoutMock = vi.spyOn(globalThis, 'clearTimeout')

// Stub navigator.locks if it doesn't exist
if (!navigator.locks) {
	Object.defineProperty(navigator, 'locks', {
		value: { request: vi.fn() },
		writable: true,
		configurable: true
	})
}

const migrateThen = vi.fn()
const migrate = vi.fn()
vi.doMock('./migrate', () => ({ migrate }))

const brandedLog = vi.fn()
vi.doMock('@/common/branded_log', () => ({ brandedLog }))

// Mock drizzle to capture the callbacks
type DrizzleCallback = (...input: unknown[]) => unknown
let capturedSingleCallback: DrizzleCallback | null = null
let capturedBatchCallback: DrizzleCallback | null = null
vi.mock('drizzle-orm/sqlite-proxy', () => ({
	drizzle: vi.fn(
		(singleCallback: DrizzleCallback, batchCallback: DrizzleCallback) => {
			capturedSingleCallback = singleCallback
			capturedBatchCallback = batchCallback
			return {} // Return a mock db instance
		}
	)
}))

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
			const postMessage = vi.fn()
			beforeEach(() => {
				client = new DbThinClient(inputs)
				const port = { postMessage } as unknown as MessagePort
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
				describe('NeverConnecting', () => {
					beforeEach(() => {
						// @ts-expect-error We want to ensure that it is NeverConnecting
						client.status = DbResourceStatus.NeverConnecting
					})
					it('returns early without doing anything', () => {
						expect(migrate).not.toHaveBeenCalled()
						expect(postMessage).not.toHaveBeenCalled()
						onmessage(
							new MessageEvent<DownstreamDbWorkerMessage>('message', {
								data: { type: DownstreamDbWorkerMessageType.Ready }
							})
						)
						expect(migrate).not.toHaveBeenCalled()
						expect(postMessage).not.toHaveBeenCalled()
					})
				})
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
				describe('ConnectedAndMigrated', () => {
					beforeEach(() => {
						// @ts-expect-error We want to ensure that it is
						// ConnectedAndMigratedwihout having to use the
						// methods, which are probably a bit less trustworthy
						client.status = DbResourceStatus.ConnectedAndMigrated
					})
					it('posts nothing if there is no currentHotMessage', () => {
						// @ts-expect-error We do this just in case it isn't
						// undefined for some reason
						client.currentHotMessage = undefined
						expect(postMessage).not.toHaveBeenCalled()
						onmessage(
							new MessageEvent<DownstreamDbWorkerMessage>('message', {
								data: { type: DownstreamDbWorkerMessageType.Ready }
							})
						)
						expect(postMessage).not.toHaveBeenCalled()
					})
					it('posts the currentHotMessage if there is one', () => {
						const testMessage = {
							type: UpstreamDbWorkerMessageType.ExecOne,
							params: ['a', ['b'], 'run'] as [string, string[], 'run']
						} satisfies UpstreamDbWorkerMessage
						// @ts-expect-error This is easier / more trustworthy
						// than using the methods to achieve the same goal
						client.currentHotMessage = testMessage
						expect(postMessage).not.toHaveBeenCalled()
						onmessage(
							new MessageEvent<DownstreamDbWorkerMessage>('message', {
								data: { type: DownstreamDbWorkerMessageType.Ready }
							})
						)
						expect(postMessage).toHaveBeenCalledExactlyOnceWith(testMessage)
					})
				})
			})
			describe.each([
				DownstreamDbWorkerMessageType.SingleSuccessfulExecResult,
				DownstreamDbWorkerMessageType.BatchSuccessfulExecResult
			] as const)('Successful exec result (%s)', (type) => {
				it('calls all queued success handlers, clears the queue, and unsets currentHotMessage', () => {
					const result = { some: 'value' }
					const success1 = vi.fn()
					const success2 = vi.fn()
					const reject1 = vi.fn()
					const reject2 = vi.fn()

					// @ts-expect-error We are testing the private value
					const queue: typeof client.thenableQueue = client.thenableQueue

					queue.add([success1 as Parameters<typeof queue.add>[0][0], reject1])
					queue.add([success2 as Parameters<typeof queue.add>[0][0], reject2])

					// @ts-expect-error We are testing the private value
					client.currentHotMessage = {
						type: UpstreamDbWorkerMessageType.ExecOne
					} as UpstreamDbWorkerMessage

					onmessage(
						new MessageEvent<DownstreamDbWorkerMessage>('message', {
							data: {
								type,
								// @ts-expect-error We only care that this
								// is passed through
								result
							}
						})
					)

					expect(success1).toHaveBeenCalledExactlyOnceWith(result)
					expect(success2).toHaveBeenCalledExactlyOnceWith(result)
					expect(reject1).not.toHaveBeenCalled()
					expect(reject2).not.toHaveBeenCalled()

					expect(queue.size).toBe(0)
					// @ts-expect-error We are testing the private value
					expect(client.currentHotMessage).toBeUndefined()
				})
				it('logs when a success handler throws', () => {
					const error = new Error('boom')
					const success = vi.fn(() => {
						throw error
					})
					const reject = vi.fn()

					// @ts-expect-error We are testing the private value
					const queue: typeof client.thenableQueue = client.thenableQueue

					queue.add([success as Parameters<typeof queue.add>[0][0], reject])

					const initialLength = brandedLog.mock.calls.length

					onmessage(
						new MessageEvent<DownstreamDbWorkerMessage>('message', {
							data: {
								type,
								// @ts-expect-error We only care that this
								// is passed through
								result: {}
							}
						})
					)

					expect(success).toHaveBeenCalledOnce()
					expect(reject).not.toHaveBeenCalled()
					expect(brandedLog.mock.calls.length).toBe(initialLength + 1)
					const brandedLogCall = brandedLog.mock.lastCall
					expect(brandedLogCall).toBeDefined()
					if (!brandedLogCall) expect.fail()
					expect(brandedLogCall).toContain(error)
				})
			})
			describe.each([
				DownstreamDbWorkerMessageType.SingleFailedExecResult,
				DownstreamDbWorkerMessageType.BatchFailedExecResult
			] as const)('Failed exec result (%s)', (type) => {
				it('calls all queued rejection handlers, clears the queue, and unsets currentHotMessage', () => {
					const success1 = vi.fn()
					const success2 = vi.fn()
					const reject1 = vi.fn()
					const reject2 = vi.fn()

					// @ts-expect-error We are testing the private value
					const queue: typeof client.thenableQueue = client.thenableQueue

					queue.add([success1 as Parameters<typeof queue.add>[0][0], reject1])
					queue.add([success2 as Parameters<typeof queue.add>[0][0], reject2])

					// @ts-expect-error We are testing the private value
					client.currentHotMessage = {
						type: UpstreamDbWorkerMessageType.ExecOne
					} as UpstreamDbWorkerMessage

					onmessage(
						new MessageEvent<DownstreamDbWorkerMessage>('message', {
							data: {
								type
							} as DownstreamDbWorkerMessage
						})
					)

					expect(success1).not.toHaveBeenCalled()
					expect(success2).not.toHaveBeenCalled()
					expect(reject1).toHaveBeenCalledOnce()
					expect(reject2).toHaveBeenCalledOnce()

					expect(queue.size).toBe(0)
					// @ts-expect-error We are testing the private value
					expect(client.currentHotMessage).toBeUndefined()
				})
				it('logs when a rejection handler throws', () => {
					const error = new Error('boom')
					const success = vi.fn()
					const reject = vi.fn(() => {
						throw error
					})

					// @ts-expect-error We are testing the private value
					const queue: typeof client.thenableQueue = client.thenableQueue

					queue.add([success as Parameters<typeof queue.add>[0][0], reject])

					const initialLength = brandedLog.mock.calls.length

					onmessage(
						new MessageEvent<DownstreamDbWorkerMessage>('message', {
							data: {
								type
							} as DownstreamDbWorkerMessage
						})
					)

					expect(success).not.toHaveBeenCalled()
					expect(reject).toHaveBeenCalledOnce()
					expect(brandedLog.mock.calls.length).toBe(initialLength + 1)
					const brandedLogCall = brandedLog.mock.lastCall
					expect(brandedLogCall).toBeDefined()
					if (!brandedLogCall) expect.fail()
					expect(brandedLogCall).toContain(error)
				})
			})
		})
	})
})

describe('drizzle proxy callbacks', () => {
	let client: DbThinClientType
	let mockPort: MessagePort
	const postMessage = vi.fn()
	let navigatorLocksRequest: typeof navigator.locks.request

	beforeEach(() => {
		mockPort = { postMessage } as unknown as MessagePort
		client = new DbThinClient(inputs)
		client.newPort(mockPort)
		postMessage.mockClear()

		// Store and mock navigator.locks.request
		navigatorLocksRequest = navigator.locks.request
		// @ts-expect-error Mocking navigator.locks.request
		navigator.locks.request = vi.fn((name, callback) => {
			// Execute the callback immediately for testing
			return Promise.resolve(callback())
		})
	})

	afterEach(() => {
		// Restore navigator.locks.request
		navigator.locks.request = navigatorLocksRequest
	})

	describe('lockedThenable.then', () => {
		it('adds handlers to thenableQueue', () => {
			// @ts-expect-error We need to access the private member
			const { lockedThenable } = client
			const successHandler = vi.fn()
			const rejectHandler = vi.fn()

			// @ts-expect-error We need to access the private member
			expect(client.thenableQueue.size).toBe(0)

			lockedThenable.then(successHandler, rejectHandler)

			// @ts-expect-error We need to access the private member
			expect(client.thenableQueue.size).toBe(1)
			// @ts-expect-error We need to access the private member
			const firstEntry = [...client.thenableQueue][0]
			if (!firstEntry) expect.fail('No entry in thenableQueue')
			const [queuedSuccess, queuedReject] = firstEntry
			expect(queuedSuccess).toBe(successHandler)
			expect(queuedReject).toBe(rejectHandler)
		})
	})

	describe('opLocked', () => {
		it('calls navigator.locks.request with correct lock name', async () => {
			const lockRequestSpy = vi.mocked(navigator.locks.request)
			const callback = vi.fn(() => Promise.resolve('result'))

			// @ts-expect-error We need to access the private member
			await client.opLocked(callback)

			expect(lockRequestSpy).toHaveBeenCalledOnce()
			expect(lockRequestSpy.mock.calls[0]?.[0]).toBe(
				`ground0::dbop_${inputs.dbName}`
			)
			expect(callback).toHaveBeenCalledOnce()
		})
	})

	describe('drizzle proxy callbacks', () => {
		it('single query callback sets ExecOne message and posts to port', async () => {
			// Create a new client that will capture callbacks
			capturedSingleCallback = null
			capturedBatchCallback = null

			const testClient = new DbThinClient(inputs)
			testClient.newPort(mockPort)
			postMessage.mockClear()

			// The callbacks should have been captured during construction
			if (!capturedSingleCallback) {
				throw new Error('Single callback was not captured')
			}

			const queryParams = ['SELECT * FROM test', [], 'run']
			// Invoke the captured callback directly - it returns a promise
			const callback = capturedSingleCallback as DrizzleCallback
			const promise = callback(...queryParams)

			// Wait for the promise and async operations
			await Promise.resolve()

			expect(postMessage).toHaveBeenCalledOnce()
			const message = postMessage.mock.calls[0]?.[0]
			expect(message).toMatchObject({
				type: UpstreamDbWorkerMessageType.ExecOne,
				params: queryParams
			})

			// @ts-expect-error We need to access the private member
			expect(testClient.currentHotMessage).toMatchObject({
				type: UpstreamDbWorkerMessageType.ExecOne,
				params: queryParams
			})

			// Verify it returns the lockedThenable
			expect(promise).toHaveProperty('then')
		})

		it('batch query callback sets ExecBatch message and posts to port', async () => {
			// Create a new client that will capture callbacks
			capturedSingleCallback = null
			capturedBatchCallback = null

			const testClient = new DbThinClient(inputs)
			testClient.newPort(mockPort)
			postMessage.mockClear()

			// The callbacks should have been captured during construction
			if (!capturedBatchCallback) {
				throw new Error('Batch callback was not captured')
			}

			const batchParams = [
				['INSERT INTO test VALUES (?)', 'INSERT INTO test VALUES (?)'],
				[['value1'], ['value2']],
				'values'
			]
			// Invoke the captured callback directly - it returns a promise
			const batchCallback = capturedBatchCallback as DrizzleCallback
			const promise = batchCallback(...batchParams)

			// Wait for the promise and async operations
			await Promise.resolve()

			expect(postMessage).toHaveBeenCalledOnce()
			const message = postMessage.mock.calls[0]?.[0]
			expect(message).toMatchObject({
				type: UpstreamDbWorkerMessageType.ExecBatch,
				params: batchParams
			})

			// @ts-expect-error We need to access the private member
			expect(testClient.currentHotMessage).toMatchObject({
				type: UpstreamDbWorkerMessageType.ExecBatch,
				params: batchParams
			})

			// Verify it returns the lockedThenable
			expect(promise).toHaveProperty('then')
		})
	})
})
