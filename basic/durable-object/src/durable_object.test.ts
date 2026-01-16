/// <reference types="@cloudflare/vitest-pool-workers" />
/// <reference types="./testing/worker-configuration.d.ts" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import { runInDurableObject } from 'cloudflare:test'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import type {
	SampleObject,
	SampleObjectWithOptions
} from './testing/sample_object'
import { SyncEngineBackend } from './durable_object'
import {
	UpstreamWsMessageAction,
	WsCloseCode,
	type UpstreamWsMessage,
	TransitionImpact,
	DownstreamWsMessageAction,
	type UUID
} from '@ground0/shared'
import { isUpstreamWsMessage } from '@ground0/shared/zod'
import SuperJSON from 'superjson'
import { sql } from 'drizzle-orm'
import type { TestingUpdate } from '@ground0/shared/testing'

// If we don't do this, env.* won't have our SAMPLE_OBJECT binding.
declare module 'cloudflare:test' {
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface ProvidedEnv extends Env {}
}

vi.mock('drizzle-orm/durable-sqlite/migrator', { spy: true })
const migrateMock = vi.mocked(migrate).mockImplementation(async () => {})

afterEach(() => {
	migrateMock.mockClear()
})

// Set a stub up to run inside of
let stub: DurableObjectStub<SampleObject>
beforeEach(() => {
	const id = env.SAMPLE_OBJECT.newUniqueId()
	stub = env.SAMPLE_OBJECT.get(id)
})

describe('send helper function', () => {
	it('does not send when websocket is not OPEN', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const handleSpy = vi.fn().mockResolvedValue(false)
			// @ts-expect-error Testing private/protected
			instance.backendHandlers['test-action'] = { confirm: handleSpy }
			vi.spyOn(ctx, 'getTags').mockReturnValue(['id1' as UUID])
			// Create a socket that's not OPEN (readyState 0 = CONNECTING)
			const mockWs = { readyState: 0, send: vi.fn() } as unknown as WebSocket

			await (
				instance as unknown as {
					processTransition: (
						t: unknown,
						id: number,
						ws: WebSocket
					) => Promise<void>
				}
			).processTransition(
				{
					action: 'test-action',
					data: {},
					impact: TransitionImpact.OptimisticPush
				},
				123,
				mockWs
			)

			// Handler was called, but send should NOT be called because ws is not OPEN
			expect(handleSpy).toHaveBeenCalled()
			expect(mockWs.send).not.toHaveBeenCalled()
		})
	})
})
describe('constructor', () => {
	it('assigns this.db', async () => {
		await runInDurableObject(stub, (instance) => {
			// @ts-expect-error We need to acces private members for testing.
			expect(instance.db).toBeDefined()
		})
	})
	it('assigns options when passed to constructor', async () => {
		const stubWithOptions: DurableObjectStub<SampleObjectWithOptions> =
			env.SAMPLE_OBJECT_WITH_OPTIONS.get(
				env.SAMPLE_OBJECT_WITH_OPTIONS.newUniqueId()
			)
		await runInDurableObject(stubWithOptions, (instance) => {
			// @ts-expect-error We need to acces private members for testing.
			expect(instance.drizzleVerbose).toBe(true)
		})
	})
	it('calls for a migration', async () => {
		await runInDurableObject(stub, (instance) => {
			expect(migrateMock).toHaveBeenCalledExactlyOnceWith(
				// @ts-expect-error We need to acces private members for testing.
				instance.db,
				// @ts-expect-error We need to acces private members for testing.
				instance.engineDef.db.migrations
			)
		})
	})
	it('sets a websocket autoresponse pair', async () => {
		await runInDurableObject(stub, (_, ctx) => {
			expect(ctx.getWebSocketAutoResponse()).toBeInstanceOf(
				WebSocketRequestResponsePair
			)
			expect(ctx.getWebSocketAutoResponse()?.request).toEqual('?')
			expect(ctx.getWebSocketAutoResponse()?.response).toEqual('!')
		})
	})
	it('does not overwrite existing websocket autoresponse pair', async () => {
		await runInDurableObject(stub, (instance, ctx) => {
			const existingPair = new WebSocketRequestResponsePair('a', 'b')
			ctx.setWebSocketAutoResponse(existingPair)

			// @ts-expect-error Accessing protected/private for testing
			const _newInstance = new (instance.constructor as unknown as new (
				...args: unknown[]
			) => unknown)(ctx, env)
			expect(ctx.getWebSocketAutoResponse()).toStrictEqual(existingPair)
		})
	})
	it('recovers initialized sockets from the database on startup', async () => {
		const socketId = crypto.randomUUID()
		await runInDurableObject(stub, async (instance, ctx) => {
			// @ts-expect-error Accessing private member
			await instance.db.run(
				sql`INSERT INTO __ground0_connections (id) VALUES (${socketId})`
			)

			// Create a new instance which should load from DB
			const newInstance = new (instance.constructor as unknown as new (
				...args: unknown[]
			) => unknown)(ctx, env)

			// Wait for the async blockConcurrencyWhile to complete
			await vi.waitUntil(
				async () => {
					// @ts-expect-error Accessing private member
					return newInstance.initialisedSockets.includes(socketId)
				},
				{ timeout: 2000 }
			)

			// @ts-expect-error Accessing private member
			expect(newInstance.initialisedSockets).toContain(socketId)
		})
	})
	it('handles empty id values when recovering sockets', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			// Use raw SQL to insert an empty string (which is technically allowed by NOT NULL but is falsy)
			// @ts-expect-error Accessing private member
			await instance.db.run(
				sql`INSERT INTO __ground0_connections (id) VALUES ('')`
			)

			// Create a new instance which should skip the empty entry
			const newInstance = new (instance.constructor as unknown as new (
				...args: unknown[]
			) => unknown)(ctx, env) as typeof instance

			// Wait for blockConcurrencyWhile to complete
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Empty string should not be in initialisedSockets
			// @ts-expect-error Accessing private member
			expect(newInstance.initialisedSockets).not.toContain('')
		})
	})
})
describe('default preCheckFetch', () => {
	it('returns 400 Response if no engine_name provided', () => {
		const returned = SyncEngineBackend.preCheckFetch(
			new Request('http://example.com')
		)
		expect(returned).not.toBeTypeOf('string')
		if (typeof returned !== 'string') expect(returned.status).toBe(400)
	})
	it('returns engine_name if engine_name provided', () => {
		const returned = SyncEngineBackend.preCheckFetch(
			new Request('http://example.com/?engine_name=barry')
		)
		expect(returned).toBeTypeOf('string')
		expect(returned).toBe('barry')
	})
})
describe('fetch handler', () => {
	it('sends a 101 back for a normal request', async () => {
		await runInDurableObject(stub, async (instance) => {
			const headerConfigs = [
				{
					Connection: 'Upgrade',
					Upgrade: 'websocket'
				},
				{
					Connection: 'Upgrade',
					Upgrade:
						'someprotocol/1.1 someotherprotocol websocket yetanotherprotocol'
				}
			]
			for (const headers of headerConfigs) {
				const response = await instance.fetch(
					new Request('http://example.com/', {
						headers: headers satisfies
							| { Upgrade: string }
							| { Connection: string }
							| { Upgrade: string; Connection: string }
							| Record<PropertyKey, never>
					})
				)
				expect(response.status).toBe(101)
			}
		})
	})
	it('accepts a different socket to what it sends to the client', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const spy = vi.spyOn(ctx, 'acceptWebSocket')
			const response = await instance.fetch(
				new Request('http://example.com/', {
					headers: {
						Connection: 'Upgrade',
						Upgrade: 'websocket'
					}
				})
			)
			expect(spy).toHaveBeenCalledOnce()
			expect(spy.mock.lastCall?.[0]).toBeDefined()
			expect(spy.mock.lastCall?.[0]).not.toBe(response.webSocket)
		})
	})
	it("sends a 500 back if there isn't a client or server socket", async () => {
		await runInDurableObject(stub, async (instance) => {
			const ogObjectValues = Object.values
			let produce: boolean[] = [false, false]
			const spy = vi.spyOn(Object, 'values').mockImplementation((obj) => {
				const values = ogObjectValues(obj)
				return values.map((value, idx) => (produce[idx] ? value : undefined))
			})
			const configs = [
				[false, false],
				[true, false],
				[false, true]
			]
			for (const config of configs) {
				spy.mockClear()
				produce = config
				const response = await instance.fetch(
					new Request('http://example.com/', {
						headers: {
							Connection: 'Upgrade',
							Upgrade: 'websocket'
						}
					})
				)
				expect(spy).toHaveBeenCalledOnce()
				expect(response.status).toBe(500)
			}

			spy.mockReset()
		})
	})
	it("sends a 426 back if the headers for an upgrade aren't set properly", async () => {
		await runInDurableObject(stub, async (instance) => {
			const headerConfigs = [
				{
					Upgrade: 'websocket'
				},
				{
					Upgrade: 'notwebsocket'
				},
				{
					Connection: 'Upgrade'
				},
				{
					Connection: 'NotUpgrade'
				},
				{
					Connection: 'NotUpgrade',
					Upgrade: 'websocket'
				},
				{
					Connection: 'Upgrade',
					Upgrade: 'notwebsocket'
				},
				{}
			]
			for (const headers of headerConfigs) {
				const response = await instance.fetch(
					new Request('http://example.com/', {
						headers: headers as
							| {
									Upgrade: 'websocket'
							  }
							| {
									Connection: 'Upgrade'
							  }
							| Record<PropertyKey, never>
					})
				)
				expect(response.status).toBe(426)
			}
		})
	})
	it('calls checkFetch if defined', async () => {
		await runInDurableObject(stub, async (instance) => {
			const checkFetch = vi.fn()
			const request = new Request('http://example.com/', {
				headers: {
					Connection: 'Upgrade',
					Upgrade: 'websocket'
				}
			})
			// @ts-expect-error We could use a different class, but that would be inconvenient
			instance.checkFetch = checkFetch
			const response = await instance.fetch(request)
			expect(response.status).toBe(101)
			expect(checkFetch).toHaveBeenCalledExactlyOnceWith(request)
		})
	})
	it('returns response from checkFetch if it exists', async () => {
		await runInDurableObject(stub, async (instance) => {
			const desiredResponse = new Response("I'm a teapot", { status: 418 })
			const checkFetch = vi.fn(() => desiredResponse)
			const request = new Request('http://example.com/', {
				headers: {
					Connection: 'Upgrade',
					Upgrade: 'websocket'
				}
			})
			// @ts-expect-error We could use a different class, but that would be inconvenient
			instance.checkFetch = checkFetch
			const response = await instance.fetch(request)
			expect(response).toBe(desiredResponse)
			expect(checkFetch).toHaveBeenCalledExactlyOnceWith(request)
		})
	})
})
describe('websocket message handler', () => {
	it('rejects ArrayBuffers', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const pair = new WebSocketPair()
			ctx.acceptWebSocket(pair[1], [crypto.randomUUID()])
			const closeMock = vi.spyOn(pair[1], 'close')
			await instance.webSocketMessage(pair[1], new ArrayBuffer())
			expect(closeMock).toHaveBeenCalledOnce()
			expect(closeMock.mock.lastCall?.[0]).toEqual(WsCloseCode.InvalidMessage)
		})
	})
	it('rejects non-JSON', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const pair = new WebSocketPair()
			ctx.acceptWebSocket(pair[1], [crypto.randomUUID()])
			const closeMock = vi.spyOn(pair[1], 'close')
			await instance.webSocketMessage(pair[1], 'not json :)')
			expect(closeMock).toHaveBeenCalledOnce()
			expect(closeMock.mock.lastCall?.[0]).toEqual(WsCloseCode.InvalidMessage)
		})
	})
	it("rejects messages that don't match the schema", async ({ skip }) => {
		const badMessage: UpstreamWsMessage = {
			action: UpstreamWsMessageAction.Init,
			version: 'aunuyn'
		}
		if (isUpstreamWsMessage(badMessage)) return skip()

		await runInDurableObject(stub, async (instance, ctx) => {
			const pair = new WebSocketPair()
			ctx.acceptWebSocket(pair[1], [crypto.randomUUID()])
			const closeMock = vi.spyOn(pair[1], 'close')
			await instance.webSocketMessage(pair[1], SuperJSON.stringify(badMessage))
			expect(closeMock).toHaveBeenCalledOnce()
			expect(closeMock.mock.lastCall?.[0]).toEqual(WsCloseCode.InvalidMessage)
		})
	})
	describe('init message handling', () => {
		it('closes if no tags applied', async () => {
			await runInDurableObject(stub, async (instance, ctx) => {
				const pair = new WebSocketPair()
				ctx.acceptWebSocket(pair[1], [])
				const closeMock = vi.spyOn(pair[1], 'close')
				await instance.webSocketMessage(
					pair[1],
					SuperJSON.stringify({
						action: UpstreamWsMessageAction.Init,
						version: '1.2.3'
					} satisfies UpstreamWsMessage)
				)
				expect(closeMock).toHaveBeenCalledOnce()
				expect(closeMock.mock.lastCall?.[0]).toEqual(WsCloseCode.NoTagsApplied)
			})
		})
		describe('version comparison', () => {
			it('closes on incompatible major version', async () => {
				await runInDurableObject(stub, async (instance, ctx) => {
					const pair = new WebSocketPair()
					ctx.acceptWebSocket(pair[1], [crypto.randomUUID()])
					const closeMock = vi.spyOn(pair[1], 'close')
					await instance.webSocketMessage(
						pair[1],
						SuperJSON.stringify({
							action: UpstreamWsMessageAction.Init,
							version: '2.0.0'
						} satisfies UpstreamWsMessage)
					)
					expect(closeMock).toHaveBeenCalledOnce()
					expect(closeMock.mock.lastCall?.[0]).toEqual(WsCloseCode.Incompatible)
				})
			})
			it('does not close on matching major version', async () => {
				await runInDurableObject(stub, async (instance, ctx) => {
					const pair = new WebSocketPair()
					ctx.acceptWebSocket(pair[1], [crypto.randomUUID()])
					const closeMock = vi.spyOn(pair[1], 'close')
					await instance.webSocketMessage(
						pair[1],
						SuperJSON.stringify({
							action: UpstreamWsMessageAction.Init,
							version: '1.2.3'
						} satisfies UpstreamWsMessage)
					)
					expect(closeMock).not.toHaveBeenCalled()
				})
			})
			it('closes on 0.x.x minor version mismatch', async () => {
				await runInDurableObject(stub, async (instance, ctx) => {
					// @ts-expect-error Testing private/protected - modify engine version to 0.x.x
					instance.engineDef = {
						// @ts-expect-error Testing private/protected
						...instance.engineDef,
						version: { current: '0.5.0' }
					}

					const pair = new WebSocketPair()
					ctx.acceptWebSocket(pair[1], [crypto.randomUUID()])
					const closeMock = vi.spyOn(pair[1], 'close')
					await instance.webSocketMessage(
						pair[1],
						SuperJSON.stringify({
							action: UpstreamWsMessageAction.Init,
							version: '0.3.0' // Different minor version in 0.x.x range
						} satisfies UpstreamWsMessage)
					)
					expect(closeMock).toHaveBeenCalledOnce()
					expect(closeMock.mock.lastCall?.[0]).toEqual(WsCloseCode.Incompatible)
				})
			})
			it('does not close on 0.x.x matching minor version', async () => {
				await runInDurableObject(stub, async (instance, ctx) => {
					// @ts-expect-error Testing private/protected - modify engine version to 0.x.x
					instance.engineDef = {
						// @ts-expect-error Testing private/protected
						...instance.engineDef,
						version: { current: '0.5.2' }
					}

					const pair = new WebSocketPair()
					ctx.acceptWebSocket(pair[1], [crypto.randomUUID()])
					const closeMock = vi.spyOn(pair[1], 'close')
					await instance.webSocketMessage(
						pair[1],
						SuperJSON.stringify({
							action: UpstreamWsMessageAction.Init,
							version: '0.5.8' // Same minor version in 0.x.x range, different patch
						} satisfies UpstreamWsMessage)
					)
					expect(closeMock).not.toHaveBeenCalled()
				})
			})
		})
		it('calls autorun onConnect handlers', async () => {
			await runInDurableObject(stub, async (instance, ctx) => {
				const onConnect = vi.fn()
				// @ts-expect-error Testing private/protected
				instance.autoruns = { onConnect: [onConnect] }

				const socketId = crypto.randomUUID()
				const pair = new WebSocketPair()
				ctx.acceptWebSocket(pair[1], [socketId])

				await instance.webSocketMessage(
					pair[1],
					SuperJSON.stringify({
						action: UpstreamWsMessageAction.Init,
						version: '1.0.0'
					} satisfies UpstreamWsMessage)
				)

				expect(onConnect).toHaveBeenCalledWith(socketId)
			})
		})
		it('handles throwing autorun onConnect handlers', async () => {
			await runInDurableObject(stub, async (instance, ctx) => {
				const consoleErrorSpy = vi
					.spyOn(console, 'error')
					.mockImplementation(() => {})
				const error = new Error('boom')
				const onConnect = vi.fn().mockRejectedValue(error)
				// @ts-expect-error Testing private/protected
				instance.autoruns = { onConnect }

				const pair = new WebSocketPair()
				ctx.acceptWebSocket(pair[1], [crypto.randomUUID()])

				await instance.webSocketMessage(
					pair[1],
					SuperJSON.stringify({
						action: UpstreamWsMessageAction.Init,
						version: '1.0.0'
					} satisfies UpstreamWsMessage)
				)

				expect(onConnect).toHaveBeenCalled()
				expect(consoleErrorSpy).toHaveBeenCalledWith(error)
			})
		})
	})
	describe('transition message handling', () => {
		it('processes valid transitions', async () => {
			await runInDurableObject(stub, async (instance, ctx) => {
				const pair = new WebSocketPair()
				ctx.acceptWebSocket(pair[1], [crypto.randomUUID()])
				await instance.webSocketMessage(
					pair[1],
					SuperJSON.stringify({
						action: UpstreamWsMessageAction.Init,
						version: '1.0.0'
					} satisfies UpstreamWsMessage)
				)

				await instance.webSocketMessage(
					pair[1],
					SuperJSON.stringify({
						action: UpstreamWsMessageAction.Transition,
						id: 1,
						data: {
							action: 3,
							data: { foo: 'test', bar: 42 },
							impact: TransitionImpact.OptimisticPush
						}
					} satisfies UpstreamWsMessage)
				)
			})
		})
		it('logs invalid transitions when logInvalidTransitions is true', async () => {
			await runInDurableObject(stub, async (instance, ctx) => {
				const consoleErrorSpy = vi
					.spyOn(console, 'error')
					.mockImplementation(() => {})

				const pair = new WebSocketPair()
				ctx.acceptWebSocket(pair[1], [crypto.randomUUID()])

				// Send init first
				await instance.webSocketMessage(
					pair[1],
					SuperJSON.stringify({
						action: UpstreamWsMessageAction.Init,
						version: '1.0.0'
					} satisfies UpstreamWsMessage)
				)

				// Send an invalid transition (wrong action type that won't match schema)
				await instance.webSocketMessage(
					pair[1],
					SuperJSON.stringify({
						action: UpstreamWsMessageAction.Transition,
						id: 1,
						data: {
							action: 'invalid-action',
							data: { invalid: true },
							impact: TransitionImpact.OptimisticPush
						}
					} satisfies UpstreamWsMessage)
				)

				expect(consoleErrorSpy).toHaveBeenCalledWith(
					'Invalid transition sent:\n',
					expect.anything()
				)
				expect(consoleErrorSpy).toHaveBeenCalledWith('\nIssues:')
				expect(consoleErrorSpy).toHaveBeenCalledWith()
			})
		})
		it('closes connection when disconnectOnInvalidTransition is true', async () => {
			await runInDurableObject(stub, async (instance, ctx) => {
				vi.spyOn(console, 'error').mockImplementation(() => {})
				// @ts-expect-error Testing private/protected
				instance.disconnectOnInvalidTransition = true

				const pair = new WebSocketPair()
				ctx.acceptWebSocket(pair[1], [crypto.randomUUID()])
				const closeMock = vi.spyOn(pair[1], 'close')

				// Send init first
				await instance.webSocketMessage(
					pair[1],
					SuperJSON.stringify({
						action: UpstreamWsMessageAction.Init,
						version: '1.0.0'
					} satisfies UpstreamWsMessage)
				)

				// Send an invalid transition
				await instance.webSocketMessage(
					pair[1],
					SuperJSON.stringify({
						action: UpstreamWsMessageAction.Transition,
						id: 1,
						data: {
							action: 'invalid-action',
							data: { invalid: true },
							impact: TransitionImpact.OptimisticPush
						}
					} satisfies UpstreamWsMessage)
				)

				expect(closeMock).toHaveBeenCalledWith(WsCloseCode.InvalidMessage)
			})
		})
		it('does not log when logInvalidTransitions is false', async () => {
			await runInDurableObject(stub, async (instance, ctx) => {
				const consoleErrorSpy = vi
					.spyOn(console, 'error')
					.mockImplementation(() => {})
				// @ts-expect-error Testing private/protected
				instance.logInvalidTransitions = false

				const pair = new WebSocketPair()
				ctx.acceptWebSocket(pair[1], [crypto.randomUUID()])

				// Send init first
				await instance.webSocketMessage(
					pair[1],
					SuperJSON.stringify({
						action: UpstreamWsMessageAction.Init,
						version: '1.0.0'
					} satisfies UpstreamWsMessage)
				)

				// Send an invalid transition
				await instance.webSocketMessage(
					pair[1],
					SuperJSON.stringify({
						action: UpstreamWsMessageAction.Transition,
						id: 1,
						data: {
							action: 'invalid-action',
							data: { invalid: true },
							impact: TransitionImpact.OptimisticPush
						}
					} satisfies UpstreamWsMessage)
				)

				expect(consoleErrorSpy).not.toHaveBeenCalledWith(
					'Invalid transition sent:\n',
					expect.anything()
				)
			})
		})
	})
})
describe('update method and logic branches', () => {
	it('sends updates to all connected sockets', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const mockWs1 = { readyState: 1, send: vi.fn() } as unknown as WebSocket
			const mockWs2 = { readyState: 1, send: vi.fn() } as unknown as WebSocket

			const getWebSocketsSpy = vi
				.spyOn(ctx, 'getWebSockets')
				.mockReturnValue([mockWs1, mockWs2])
			vi.spyOn(ctx, 'getTags').mockReturnValue([crypto.randomUUID()])

			const updateData = { some: 'update' }
			// @ts-expect-error Testing protected method
			instance.update(updateData)

			expect(mockWs1.send).toHaveBeenCalled()
			expect(mockWs2.send).toHaveBeenCalled()
			getWebSocketsSpy.mockRestore()
		})
	})
	it('sends OptimisticCancel when confirm returns false', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const confirmSpy = vi.fn().mockResolvedValue(false)
			// @ts-expect-error Testing private/protected
			instance.backendHandlers['test-reject'] = { confirm: confirmSpy }
			vi.spyOn(ctx, 'getTags').mockReturnValue(['id1' as UUID])
			const mockWs = { readyState: 1, send: vi.fn() } as unknown as WebSocket

			await (
				instance as unknown as {
					processTransition: (
						t: unknown,
						id: number,
						ws: WebSocket
					) => Promise<void>
				}
			).processTransition(
				{
					action: 'test-reject',
					data: {},
					impact: TransitionImpact.OptimisticPush
				},
				999,
				mockWs
			)

			expect(confirmSpy).toHaveBeenCalled()
			expect(mockWs.send).toHaveBeenCalled()
			const sendMock = mockWs.send as ReturnType<typeof vi.fn>
			const response = SuperJSON.parse(
				sendMock.mock.calls[0]?.[0] as string
			) as {
				action: DownstreamWsMessageAction
			}
			expect(response.action).toBe(DownstreamWsMessageAction.OptimisticCancel)
		})
	})
	it('handles missing handlers gracefully', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const consoleErrorSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {})
			// @ts-expect-error Testing private/protected
			instance.backendHandlers = {} // Remove handlers

			// Create a mock socket
			const mockWs = { readyState: 1, send: vi.fn() } as unknown as WebSocket
			vi.spyOn(ctx, 'getTags').mockReturnValue(['id1' as UUID])

			await (
				instance as unknown as {
					processTransition: (
						t: unknown,
						id: number,
						ws: WebSocket
					) => Promise<void>
				}
			).processTransition(
				{
					action: 'non-existent',
					data: {},
					impact: TransitionImpact.OptimisticPush
				},
				123,
				mockWs
			)

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				'No handler found for action: non-existent'
			)
		})
	})
	it('handles missing connectionId gracefully', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			vi.spyOn(ctx, 'getTags').mockReturnValue([]) // No tags
			const mockWs = { readyState: 1, send: vi.fn() } as unknown as WebSocket
			const result = await (
				instance as unknown as {
					processTransition: (
						t: unknown,
						id: number,
						ws: WebSocket
					) => Promise<void>
				}
			).processTransition(
				{
					action: 3,
					data: { foo: 'x', bar: 0 },
					impact: TransitionImpact.OptimisticPush
				},
				123,
				mockWs
			)
			expect(result).toBeUndefined()
		})
	})
	it('processes WsOnlyNudge and sends ACK', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const handleSpy = vi.fn()
			// @ts-expect-error Testing private/protected
			instance.backendHandlers['test-nudge'] = { handle: handleSpy }
			vi.spyOn(ctx, 'getTags').mockReturnValue(['id1' as UUID])
			const mockWs = { readyState: 1, send: vi.fn() } as unknown as WebSocket

			await (
				instance as unknown as {
					processTransition: (
						t: unknown,
						id: number,
						ws: WebSocket
					) => Promise<void>
				}
			).processTransition(
				{
					action: 'test-nudge',
					data: {},
					impact: TransitionImpact.WsOnlyNudge
				},
				456,
				mockWs
			)

			expect(handleSpy).toHaveBeenCalled()
			expect(mockWs.send).toHaveBeenCalled()
			const sendMock = mockWs.send as ReturnType<typeof vi.fn>
			const response = SuperJSON.parse(
				sendMock.mock.calls[0]?.[0] as string
			) as {
				action: DownstreamWsMessageAction
			}
			expect(response.action).toBe(DownstreamWsMessageAction.AckWsNudge)
		})
	})
	it('processes UnreliableWsOnlyNudge without ACK', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const handleSpy = vi.fn()
			// @ts-expect-error Testing private/protected
			instance.backendHandlers['test-unreliable'] = { handle: handleSpy }
			vi.spyOn(ctx, 'getTags').mockReturnValue(['id1' as UUID])
			const mockWs = { readyState: 1, send: vi.fn() } as unknown as WebSocket

			await (
				instance as unknown as {
					processTransition: (
						t: unknown,
						id: number,
						ws: WebSocket
					) => Promise<void>
				}
			).processTransition(
				{
					action: 'test-unreliable',
					data: {},
					impact: TransitionImpact.UnreliableWsOnlyNudge
				},
				789,
				mockWs
			)

			expect(handleSpy).toHaveBeenCalled()
			expect(mockWs.send).not.toHaveBeenCalled()
		})
	})
	it('skips closed sockets in update', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const mockWsClosed = {
				readyState: 3,
				send: vi.fn()
			} as unknown as WebSocket
			const mockWsOpen = {
				readyState: 1,
				send: vi.fn()
			} as unknown as WebSocket

			vi.spyOn(ctx, 'getWebSockets').mockReturnValue([mockWsClosed, mockWsOpen])
			vi.spyOn(ctx, 'getTags').mockReturnValue([crypto.randomUUID()])

			// @ts-expect-error Testing protected method
			instance.update({ some: 'data' })

			expect(mockWsClosed.send).not.toHaveBeenCalled()
			expect(mockWsOpen.send).toHaveBeenCalled()
		})
	})
	it('skips sockets without string id in update', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const mockWs = { readyState: 1, send: vi.fn() } as unknown as WebSocket

			vi.spyOn(ctx, 'getWebSockets').mockReturnValue([mockWs])
			vi.spyOn(ctx, 'getTags').mockReturnValue([123 as unknown as string])

			// @ts-expect-error Testing protected method
			instance.update({ some: 'data' })

			expect(mockWs.send).not.toHaveBeenCalled()
		})
	})
	it('sends to single target when target option is specified', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const targetId = crypto.randomUUID() as UUID
			const otherId = crypto.randomUUID() as UUID

			const mockWsTarget = {
				readyState: 1,
				send: vi.fn()
			} as unknown as WebSocket
			const mockWsOther = {
				readyState: 1,
				send: vi.fn()
			} as unknown as WebSocket

			vi.spyOn(ctx, 'getWebSockets').mockReturnValue([
				mockWsTarget,
				mockWsOther
			])
			const getTagsSpy = vi.spyOn(ctx, 'getTags')
			getTagsSpy.mockImplementation((ws) =>
				ws === mockWsTarget ? [targetId] : [otherId]
			)

			// @ts-expect-error Testing protected method
			instance.update({ some: 'data' }, { target: targetId })

			expect(mockWsTarget.send).toHaveBeenCalled()
			expect(mockWsOther.send).not.toHaveBeenCalled()
		})
	})
	it('sends to array of targets when target option is array', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const targetId1 = crypto.randomUUID() as UUID
			const targetId2 = crypto.randomUUID() as UUID
			const otherId = crypto.randomUUID() as UUID

			const mockWsTarget1 = {
				readyState: 1,
				send: vi.fn()
			} as unknown as WebSocket
			const mockWsTarget2 = {
				readyState: 1,
				send: vi.fn()
			} as unknown as WebSocket
			const mockWsOther = {
				readyState: 1,
				send: vi.fn()
			} as unknown as WebSocket

			vi.spyOn(ctx, 'getWebSockets').mockReturnValue([
				mockWsTarget1,
				mockWsTarget2,
				mockWsOther
			])
			const getTagsSpy = vi.spyOn(ctx, 'getTags')
			getTagsSpy.mockImplementation((ws) => {
				if (ws === mockWsTarget1) return [targetId1]
				if (ws === mockWsTarget2) return [targetId2]
				return [otherId]
			})

			// @ts-expect-error Testing protected method
			instance.update({ some: 'data' }, { target: [targetId1, targetId2] })

			expect(mockWsTarget1.send).toHaveBeenCalled()
			expect(mockWsTarget2.send).toHaveBeenCalled()
			expect(mockWsOther.send).not.toHaveBeenCalled()
		})
	})
	it('excludes single target when doNotTarget option is specified', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const excludeId = crypto.randomUUID() as UUID
			const otherId = crypto.randomUUID() as UUID

			const mockWsExcluded = {
				readyState: 1,
				send: vi.fn()
			} as unknown as WebSocket
			const mockWsOther = {
				readyState: 1,
				send: vi.fn()
			} as unknown as WebSocket

			// Add otherId to initialisedSockets so it passes requireConnectionInitComplete check
			// @ts-expect-error Testing private/protected
			instance.initialisedSockets = [excludeId, otherId]

			vi.spyOn(ctx, 'getWebSockets').mockReturnValue([
				mockWsExcluded,
				mockWsOther
			])
			const getTagsSpy = vi.spyOn(ctx, 'getTags')
			getTagsSpy.mockImplementation((ws) =>
				ws === mockWsExcluded ? [excludeId] : [otherId]
			)

			// @ts-expect-error Testing protected method
			instance.update(
				{ some: 'data' } as unknown as TestingUpdate,
				{ doNotTarget: excludeId, requireConnectionInitComplete: true }
			)

			expect(mockWsExcluded.send).not.toHaveBeenCalled()
			expect(mockWsOther.send).toHaveBeenCalled()
		})
	})
	it('excludes array of targets when doNotTarget option is array', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const excludeId1 = crypto.randomUUID() as UUID
			const excludeId2 = crypto.randomUUID() as UUID
			const otherId = crypto.randomUUID() as UUID

			const mockWsExcluded1 = {
				readyState: 1,
				send: vi.fn()
			} as unknown as WebSocket
			const mockWsExcluded2 = {
				readyState: 1,
				send: vi.fn()
			} as unknown as WebSocket
			const mockWsOther = {
				readyState: 1,
				send: vi.fn()
			} as unknown as WebSocket

			// Add otherId to initialisedSockets
			// @ts-expect-error Testing private/protected
			instance.initialisedSockets = [excludeId1, excludeId2, otherId]

			vi.spyOn(ctx, 'getWebSockets').mockReturnValue([
				mockWsExcluded1,
				mockWsExcluded2,
				mockWsOther
			])
			const getTagsSpy = vi.spyOn(ctx, 'getTags')
			getTagsSpy.mockImplementation((ws) => {
				if (ws === mockWsExcluded1) return [excludeId1]
				if (ws === mockWsExcluded2) return [excludeId2]
				return [otherId]
			})

			// @ts-expect-error Testing protected method
			instance.update(
				{ some: 'data' } as unknown as TestingUpdate,
				{
					doNotTarget: [excludeId1, excludeId2],
					requireConnectionInitComplete: true
				}
			)

			expect(mockWsExcluded1.send).not.toHaveBeenCalled()
			expect(mockWsExcluded2.send).not.toHaveBeenCalled()
			expect(mockWsOther.send).toHaveBeenCalled()
		})
	})
	it('skips uninitialised sockets when requireConnectionInitComplete is true', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const initialisedId = crypto.randomUUID() as UUID
			const uninitialisedId = crypto.randomUUID() as UUID

			const mockWsInitialised = {
				readyState: 1,
				send: vi.fn()
			} as unknown as WebSocket
			const mockWsUninitialised = {
				readyState: 1,
				send: vi.fn()
			} as unknown as WebSocket

			// Only add initialisedId to initialisedSockets
			// @ts-expect-error Testing private/protected
			instance.initialisedSockets = [initialisedId]

			vi.spyOn(ctx, 'getWebSockets').mockReturnValue([
				mockWsInitialised,
				mockWsUninitialised
			])
			const getTagsSpy = vi.spyOn(ctx, 'getTags')
			getTagsSpy.mockImplementation((ws) =>
				ws === mockWsInitialised ? [initialisedId] : [uninitialisedId]
			)

			// @ts-expect-error Testing protected method
			instance.update({ some: 'data' }, { requireConnectionInitComplete: true })

			expect(mockWsInitialised.send).toHaveBeenCalled()
			expect(mockWsUninitialised.send).not.toHaveBeenCalled()
		})
	})
	it('continues without sending if opts is present but does not match any condition', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const someId = crypto.randomUUID() as UUID
			const mockWs = { readyState: 1, send: vi.fn() } as unknown as WebSocket

			// Socket is not in initialisedSockets
			// @ts-expect-error Testing private/protected
			instance.initialisedSockets = []

			vi.spyOn(ctx, 'getWebSockets').mockReturnValue([mockWs])
			vi.spyOn(ctx, 'getTags').mockReturnValue([someId])

			// Pass opts without requireConnectionInitComplete key - this tests the !('requireConnectionInitComplete' in opts) branch
			// @ts-expect-error Testing protected method
			instance.update({ some: 'data' }, {})

			// With empty opts, it should continue (not send) because requireConnectionInitComplete is not in opts
			expect(mockWs.send).not.toHaveBeenCalled()
		})
	})
})
