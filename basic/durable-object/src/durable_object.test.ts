/// <reference types="@cloudflare/vitest-pool-workers" />
/// <reference types="./testing/worker-configuration.d.ts" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from 'cloudflare:test'
import { runInDurableObject } from 'cloudflare:test'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import type { SampleObject } from './testing/sample_object'
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

describe('constructor', () => {
	it('assigns this.db', async () => {
		await runInDurableObject(stub, (instance) => {
			// @ts-expect-error We need to acces private members for testing.
			expect(instance.db).toBeDefined()
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
			const newInstance = new (instance.constructor as any)(ctx, env)
			expect(ctx.getWebSocketAutoResponse()).toStrictEqual(existingPair)
		})
	})
	it('recovers initialized sockets from the database on startup', async () => {
		const socketId = crypto.randomUUID()
		await runInDurableObject(stub, async (instance, ctx) => {
			// @ts-expect-error Accessing private member
			await instance.db
				.run(sql`INSERT INTO __ground0_connections (id) VALUES (${socketId})`)

			// Create a new instance which should load from DB
			// @ts-expect-error Accessing protected/private for testing
			const newInstance = new (instance.constructor as any)(ctx, env)

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
				const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
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
						action: 3,
						data: { foo: 'test', bar: 42 },
						impact: TransitionImpact.OptimisticPush
					} satisfies UpstreamWsMessage)
				)
			})
		})
	})
})
describe('update method and logic branches', () => {
	it('sends updates to all connected sockets', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const mockWs1 = { readyState: 1, send: vi.fn() } as any
			const mockWs2 = { readyState: 1, send: vi.fn() } as any
			
			const getWebSocketsSpy = vi.spyOn(ctx, 'getWebSockets').mockReturnValue([mockWs1, mockWs2])
			vi.spyOn(ctx, 'getTags').mockReturnValue([crypto.randomUUID()])

			const updateData = { some: 'update' }
			// @ts-expect-error Testing protected method
			instance.update(updateData)

			expect(mockWs1.send).toHaveBeenCalled()
			expect(mockWs2.send).toHaveBeenCalled()
			getWebSocketsSpy.mockRestore()
		})
	})
	it('handles missing handlers gracefully', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
			// @ts-expect-error Testing private/protected
			instance.backendHandlers = {} // Remove handlers

			// Create a mock socket
			const mockWs = { readyState: 1, send: vi.fn() } as any
			vi.spyOn(ctx, 'getTags').mockReturnValue(['id1' as UUID])

			// @ts-expect-error Testing private method
			await instance.processTransition({ action: 'non-existent', data: {}, impact: TransitionImpact.OptimisticPush }, 123, mockWs)
			
			expect(consoleErrorSpy).toHaveBeenCalledWith('No handler found for action: non-existent')
		})
	})
	it('handles missing connectionId gracefully', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			vi.spyOn(ctx, 'getTags').mockReturnValue([]) // No tags
			const mockWs = { readyState: 1, send: vi.fn() } as any
			// @ts-expect-error Testing private method
			const result = await instance.processTransition({ action: 3, data: {}, impact: TransitionImpact.OptimisticPush }, 123, mockWs)
			expect(result).toBeUndefined()
		})
	})
	it('processes WsOnlyNudge and sends ACK', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const handleSpy = vi.fn()
			// @ts-expect-error Testing private/protected
			instance.backendHandlers['test-nudge'] = { handle: handleSpy }
			vi.spyOn(ctx, 'getTags').mockReturnValue(['id1' as UUID])
			const mockWs = { readyState: 1, send: vi.fn() } as any

			// @ts-expect-error Testing private method
			await instance.processTransition({ action: 'test-nudge', data: {}, impact: TransitionImpact.WsOnlyNudge }, 456, mockWs)
			
			expect(handleSpy).toHaveBeenCalled()
			expect(mockWs.send).toHaveBeenCalled()
			const response = SuperJSON.parse(mockWs.send.mock.calls[0][0]) as any
			expect(response.action).toBe(DownstreamWsMessageAction.AckWsNudge)
		})
	})
	it('processes UnreliableWsOnlyNudge without ACK', async () => {
		await runInDurableObject(stub, async (instance, ctx) => {
			const handleSpy = vi.fn()
			// @ts-expect-error Testing private/protected
			instance.backendHandlers['test-unreliable'] = { handle: handleSpy }
			vi.spyOn(ctx, 'getTags').mockReturnValue(['id1' as UUID])
			const mockWs = { readyState: 1, send: vi.fn() } as any

			// @ts-expect-error Testing private method
			await instance.processTransition({ action: 'test-unreliable', data: {}, impact: TransitionImpact.UnreliableWsOnlyNudge }, 789, mockWs)
			
			expect(handleSpy).toHaveBeenCalled()
			expect(mockWs.send).not.toHaveBeenCalled()
		})
	})
})
