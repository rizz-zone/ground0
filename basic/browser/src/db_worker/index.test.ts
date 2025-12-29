import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { UpstreamDbWorkerInitMessage } from '@/types/internal_messages/UpstreamDbWorkerInitMessage'
import type { DownstreamDbWorkerInitMessage } from '@/types/internal_messages/DownstreamDbWorkerInitMessage'

// We don't need our stdout cluttered
vi.spyOn(console, 'debug').mockImplementation(() => {})
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

const requestLock = vi.fn()
// @ts-expect-error navigator.locks isn't read-only because the test env does
// not define it whatsoever
navigator.locks = { request: requestLock } as unknown as typeof navigator.locks

const portPostMessage = vi.fn()
const port1 = { postMessage: portPostMessage },
	port2 = {}
vi.spyOn(globalThis, 'MessageChannel').mockImplementation(() => ({
	port1: port1 as unknown as MessagePort,
	port2: port2 as unknown as MessagePort
}))

const ctx = self as DedicatedWorkerGlobalScope & {
	onmessage: ((ev: MessageEvent<UpstreamDbWorkerInitMessage>) => unknown) | null
}
vi.spyOn(ctx, 'postMessage').mockImplementation(() => {})

const getRawSqliteDb = vi.fn()
vi.doMock('./raw_stage', () => ({ getRawSqliteDb }))

beforeEach(() => {
	vi.clearAllMocks()
	getRawSqliteDb.mockImplementation(() => {})
})
afterEach(() => {
	ctx.onmessage = null
})

const { dbWorkerEntrypoint } = await import('.')

const buffer = new ArrayBuffer()

const DB_NAME = 'test'

describe('dbWorkerEntrypoint', () => {
	it('sets ctx.onmessage', () => {
		expect(ctx.onmessage).not.toBeTypeOf('function')
		dbWorkerEntrypoint(DB_NAME)
		expect(ctx.onmessage).toBeTypeOf('function')
	})
	describe('ctx.onmessage', () => {
		beforeEach(() => dbWorkerEntrypoint(DB_NAME))
		it('requests db lock', ({ skip }) => {
			if (!ctx.onmessage) return skip()
			ctx.onmessage(
				new MessageEvent('message', {
					data: { buffer } satisfies UpstreamDbWorkerInitMessage
				})
			)
			expect(requestLock).toHaveBeenCalledOnce()
			expect(requestLock.mock.lastCall?.[0]).toBe(`ground0::db_${DB_NAME}`)
			expect(requestLock.mock.lastCall?.[1]).toBeTypeOf('function')
		})
		describe('lock callback', () => {
			let lockCallback:
				| (() => unknown & Parameters<typeof navigator.locks.request>[1])
				| undefined = undefined
			beforeEach(({ skip }) => {
				if (!ctx.onmessage) return skip()
				ctx.onmessage(
					new MessageEvent('message', {
						data: { buffer } satisfies UpstreamDbWorkerInitMessage
					})
				)
				lockCallback = requestLock.mock.lastCall?.[1]
				if (!lockCallback) return skip()
			})
			it('creates a port and sends it downstream', async ({ skip }) => {
				if (!lockCallback) return skip()

				// We don't want to test all of init, but we can't force it not
				// to run at all without exporting it from index.ts (we prefer
				// not to export things for testing purposes only unless
				// strictly necessary), so we make the promise it returns never
				// resolve to pause execution instead.
				getRawSqliteDb.mockImplementation(() => new Promise(() => {}))

				expect(MessageChannel).not.toHaveBeenCalled()
				expect(ctx.postMessage).not.toHaveBeenCalled()
				lockCallback()
				return await (async () => {
					expect(MessageChannel).toHaveBeenCalled()
					expect(ctx.postMessage).toHaveBeenCalledOnce()
					expect(
						(
							(ctx.postMessage as unknown as ReturnType<typeof vi.spyOn>).mock
								.lastCall?.[0] as DownstreamDbWorkerInitMessage
						)?.port
					).toEqual(port2)
				})()
			})
		})
	})
})
describe('init', () => {
	let induceInit: () => Promise<unknown>
	beforeEach(({ skip }) => {
		dbWorkerEntrypoint(DB_NAME)
		if (!ctx.onmessage) return skip()
		ctx.onmessage(
			new MessageEvent('message', {
				data: { buffer } satisfies UpstreamDbWorkerInitMessage
			})
		)
		const lockCallback = requestLock.mock.lastCall?.[1] as
			| (() => unknown & Parameters<typeof navigator.locks.request>[1])
			| undefined
		if (!lockCallback) return skip()

		// induceInit wraps lockCallback but resolves once init will have run,
		// instead of never resolving as lockCallback does. This allows us to
		// simply await in tests instead of having to use queueMicrotask or
		// manually return a promise.
		induceInit = () => {
			lockCallback()
			return (async () => {})()
		}
	})
	describe('db setup', () => {
		it('acquires raw db instance', async () => {
			await induceInit()
			expect(getRawSqliteDb).toHaveBeenCalledOnce()
			expect(getRawSqliteDb.mock.lastCall?.[0]).toMatchObject({
				wasmBinary: buffer,
				dbName: DB_NAME
			})
		})
	})
})
