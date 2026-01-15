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
	type UpstreamWsMessage
} from '@ground0/shared'
import { isUpstreamWsMessage } from '@ground0/shared/zod'
import SuperJSON from 'superjson'

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
	let socket: WebSocket
	beforeEach(async () => {
		await runInDurableObject(stub, (_, ctx) => {
			socket = new WebSocketPair()[0]
			ctx.acceptWebSocket(socket, [crypto.randomUUID()])
		})
	})
	const wsOpen = () =>
		vi.waitUntil(() => socket.readyState === WebSocket.OPEN, {
			interval: 1,
			timeout: 1000
		})
	describe('message validation', () => {
		it('rejects ArrayBuffers', async () => {
			const closeMock = vi.spyOn(socket, 'close')
			const sendMock = vi.spyOn(socket, 'send')
			await runInDurableObject(stub, async (instance) => {
				await wsOpen()
				await instance.webSocketMessage(socket, new ArrayBuffer())
				expect(closeMock).toHaveBeenCalledOnce()
				expect(closeMock.mock.lastCall?.[0]).toEqual(WsCloseCode.InvalidMessage)
				expect(sendMock).not.toHaveBeenCalled()
			})
		})
		it('rejects non-JSON', async () => {
			const closeMock = vi.spyOn(socket, 'close')
			const sendMock = vi.spyOn(socket, 'send')
			await runInDurableObject(stub, async (instance) => {
				await wsOpen()
				await instance.webSocketMessage(socket, 'not json :)')
				expect(closeMock).toHaveBeenCalledOnce()
				expect(closeMock.mock.lastCall?.[0]).toEqual(WsCloseCode.InvalidMessage)
				expect(sendMock).not.toHaveBeenCalled()
			})
		})
		it("rejects messages that don't match the schema", async ({ skip }) => {
			const badMessage: UpstreamWsMessage = {
				action: UpstreamWsMessageAction.Init,
				version: 'aunuyn'
			}
			// If the invalid message passes validation, there are tests that
			// fail elsewhere to signal the issue. We should keep this test
			// focused on whether the Durable Object works, not whether the
			// message validation works.
			if (isUpstreamWsMessage(badMessage)) return skip()

			const closeMock = vi.spyOn(socket, 'close')
			const sendMock = vi.spyOn(socket, 'send')
			await runInDurableObject(stub, async (instance) => {
				await wsOpen()
				await instance.webSocketMessage(socket, SuperJSON.stringify(badMessage))
				expect(closeMock).toHaveBeenCalledOnce()
				expect(closeMock.mock.lastCall?.[0]).toEqual(WsCloseCode.InvalidMessage)
				expect(sendMock).not.toHaveBeenCalled()
			})
		})
	})
	describe('init message handling', () => {
		it('closes if no tags applied', async () => {
			await runInDurableObject(stub, async (instance, ctx) => {
				const noTagSocket = new WebSocketPair()[0]
				ctx.acceptWebSocket(noTagSocket, [])
				await vi.waitUntil(() => noTagSocket.readyState === WebSocket.OPEN, {
					interval: 1,
					timeout: 1000
				})

				const closeMock = vi.spyOn(noTagSocket, 'close')
				await instance.webSocketMessage(
					noTagSocket,
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
			describe('major version >0', () => {
				it('closes on higher major version', async () => {
					const closeMock = vi.spyOn(socket, 'close')
					const sendMock = vi.spyOn(socket, 'send')
					await runInDurableObject(stub, async (instance) => {
						await wsOpen()
						await instance.webSocketMessage(
							socket,
							SuperJSON.stringify({
								action: UpstreamWsMessageAction.Init,
								version: '2.0.0'
							} satisfies UpstreamWsMessage)
						)
						expect(closeMock).toHaveBeenCalledOnce()
						expect(closeMock.mock.lastCall?.[0]).toEqual(
							WsCloseCode.Incompatible
						)
						expect(sendMock).not.toHaveBeenCalled()
					})
				})
				it('closes on lower major version', async () => {
					const closeMock = vi.spyOn(socket, 'close')
					const sendMock = vi.spyOn(socket, 'send')
					await runInDurableObject(stub, async (instance) => {
						await wsOpen()
						await instance.webSocketMessage(
							socket,
							SuperJSON.stringify({
								action: UpstreamWsMessageAction.Init,
								version: '0.0.1'
							} satisfies UpstreamWsMessage)
						)
						expect(closeMock).toHaveBeenCalledOnce()
						expect(closeMock.mock.lastCall?.[0]).toEqual(
							WsCloseCode.Incompatible
						)
						expect(sendMock).not.toHaveBeenCalled()
					})
				})
				it('does not close on matching major version', async () => {
					const closeMock = vi.spyOn(socket, 'close')
					await runInDurableObject(stub, async (instance) => {
						await wsOpen()
						await instance.webSocketMessage(
							socket,
							SuperJSON.stringify({
								action: UpstreamWsMessageAction.Init,
								version: '1.2.3'
							} satisfies UpstreamWsMessage)
						)
						expect(closeMock).not.toHaveBeenCalled()
					})
				})
			})
			describe('major version =0', () => {
				it('closes on higher minor version', async () => {
					const closeMock = vi.spyOn(socket, 'close')
					const sendMock = vi.spyOn(socket, 'send')
					await runInDurableObject(stub, async (instance) => {
						// @ts-expect-error We have to modify the engineDef because the
						// only alternative is to create a different object.
						instance.engineDef.version.current = '0.2.3'

						await wsOpen()
						await instance.webSocketMessage(
							socket,
							SuperJSON.stringify({
								action: UpstreamWsMessageAction.Init,
								version: '0.3.0'
							} satisfies UpstreamWsMessage)
						)
						expect(closeMock).toHaveBeenCalledOnce()
						expect(closeMock.mock.lastCall?.[0]).toEqual(
							WsCloseCode.Incompatible
						)
						expect(sendMock).not.toHaveBeenCalled()
					})
				})
				it('closes on lower minor version', async () => {
					const closeMock = vi.spyOn(socket, 'close')
					const sendMock = vi.spyOn(socket, 'send')
					await runInDurableObject(stub, async (instance) => {
						// @ts-expect-error We have to modify the engineDef because the
						// only alternative is to create a different object.
						instance.engineDef.version.current = '0.2.3'

						await wsOpen()
						await instance.webSocketMessage(
							socket,
							SuperJSON.stringify({
								action: UpstreamWsMessageAction.Init,
								version: '0.1.0'
							} satisfies UpstreamWsMessage)
						)
						expect(closeMock).toHaveBeenCalledOnce()
						expect(closeMock.mock.lastCall?.[0]).toEqual(
							WsCloseCode.Incompatible
						)
						expect(sendMock).not.toHaveBeenCalled()
					})
				})
				it('does not close on matching minor version', async () => {
					const closeMock = vi.spyOn(socket, 'close')
					await runInDurableObject(stub, async (instance) => {
						// @ts-expect-error We have to modify the engineDef because the
						// only alternative is to create a different object.
						instance.engineDef.version.current = '0.2.3'

						await wsOpen()
						await instance.webSocketMessage(
							socket,
							SuperJSON.stringify({
								action: UpstreamWsMessageAction.Init,
								version: '0.2.1'
							} satisfies UpstreamWsMessage)
						)
						expect(closeMock).not.toHaveBeenCalled()
					})
				})
			})
		})
	})
})
