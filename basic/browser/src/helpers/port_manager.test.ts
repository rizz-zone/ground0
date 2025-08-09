/// <reference lib="webworker" />

import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	test,
	vi
} from 'vitest'
import {
	__testing__do_not_use_this_ever_or_you_will_have_a_terrible_time_and_also_cause_probably_pretty_major_and_significant_bugs_and_we_wouldnt_want_that_would_we__WorkerPort as forbidden_WorkerPort,
	portManager
} from './port_manager'
import { InternalStateError, NoPortsError, importUnique } from '@ground0/shared'
import {
	UpstreamWorkerMessageType,
	type UpstreamWorkerMessage
} from '@/types/internal_messages/UpstreamWorkerMessage'
import { DB_NAME, SOCKET_URL } from '@/testing/constants'
import type { InstanceKey } from '@/types/instances/InstanceKey'
import type { InstanceData } from '@/types/instances/InstanceData'
import type { WorkerLocalFirst } from './worker_thread'

const FORBIDDEN_WORKER_PORT =
	'__testing__do_not_use_this_ever_or_you_will_have_a_terrible_time_and_also_cause_probably_pretty_major_and_significant_bugs_and_we_wouldnt_want_that_would_we__WorkerPort'

const ctx = self as unknown as SharedWorkerGlobalScope
const resetListener = () => {
	// @ts-expect-error We're resetting ctx.onconnect, and you wouldn't usually do this
	ctx.onconnect = undefined
}

const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {})
const setTimeoutMock = vi.spyOn(globalThis, 'setTimeout')
const clearTimeoutMock = vi.spyOn(globalThis, 'clearTimeout')
beforeEach(vi.clearAllMocks)
beforeAll(resetListener)
afterEach(resetListener)

// @ts-expect-error We need to assign to locks because jsdom won't do it for us
navigator.locks = {
	request: () => {}
}

const NORMAL_INIT_WORKER_MESSAGE: UpstreamWorkerMessage<unknown> = {
	type: UpstreamWorkerMessageType.Init,
	data: {
		wsUrl: SOCKET_URL,
		dbName: DB_NAME
	}
}

describe('init', () => {
	it('does not happen unprompted', async () => {
		await import('./port_manager')
		expect(ctx.onconnect).toBeUndefined()
	})
	it('sets self.onconnect', () => {
		portManager.init()
		expect(ctx.onconnect).toBeTypeOf('function')
	})
})
describe('onconnect', () => {
	beforeEach(() => {
		portManager.init()
	})
	it('throws when no ports are provided', ({ skip }) => {
		if (!ctx.onconnect) return skip()
		expect(() =>
			ctx.onconnect ? ctx.onconnect(new MessageEvent('connect')) : undefined
		).toThrow(NoPortsError)
	})
	it('assigns a listener to the port', ({ skip }) => {
		if (!ctx.onconnect) return skip()
		const channel = new MessageChannel()
		const port = channel.port1
		expect(port.onmessage).toBeNull()
		expect(port.onmessageerror).toBeNull()

		ctx.onconnect(new MessageEvent('connect', { ports: [port] }))

		expect(port.onmessage).toBeTypeOf('function')
		expect(port.onmessageerror).toBeTypeOf('function')
	})
})
describe('port message listener', ({ skip }) => {
	let workerPort: MessagePort
	let userPort: MessagePort
	beforeEach(() => {
		portManager.init()
		if (!ctx.onconnect) return skip('')
		const channel = new MessageChannel()
		const testingPort = channel.port1
		ctx.onconnect(new MessageEvent('connect', { ports: [testingPort] }))
		workerPort = testingPort
		userPort = channel.port2
	})

	describe('main thread init', () => {
		const classInstanceMap =
			// @ts-expect-error instances is private, but in this case it's convenient to see it anyway
			forbidden_WorkerPort.instances
		beforeEach(async () => {
			userPort.postMessage(NORMAL_INIT_WORKER_MESSAGE)
			// It'll take a moment for the message to get sent through
			await vi.waitUntil(() => classInstanceMap.size > 0, {
				interval: 5,
				timeout: 500
			})
		})

		test('assigns the correct static properties', () => {
			const addedInstance = classInstanceMap.get(`${SOCKET_URL}::${DB_NAME}`)
			expect(classInstanceMap.size).toBe(1)
			expect(addedInstance).toBeDefined()
			expect(addedInstance).toBeTypeOf('object')
		})
		test('sets a ping timeout', () => {
			expect(clearTimeoutMock).not.toBeCalled()
			expect(setTimeoutMock).toHaveBeenCalledOnce()
		})
	})

	it('logs errors', ({ skip }) => {
		if (!workerPort.onmessageerror) return skip()
		workerPort.onmessageerror(new MessageEvent('messageerror'))
		expect(consoleErrorMock).toHaveBeenCalledOnce()
	})
	it('resets ping timeout on ping', ({ skip }) => {
		if (!workerPort.onmessage) return skip()
		workerPort.onmessage(
			new MessageEvent<UpstreamWorkerMessage<unknown>>('message', {
				data: NORMAL_INIT_WORKER_MESSAGE
			})
		)
		workerPort.onmessage(
			new MessageEvent<UpstreamWorkerMessage<unknown>>('message', {
				data: {
					type: UpstreamWorkerMessageType.Ping
				}
			})
		)
		expect(setTimeoutMock).toHaveBeenCalledTimes(2)
		expect(setTimeoutMock).toHaveBeenCalledBefore(clearTimeoutMock)
		expect(clearTimeoutMock).toHaveBeenCalledOnce()
	})
})
describe('Symbol.dispose', () => {
	let instances: Map<InstanceKey, WorkerLocalFirst>
	let activeInstanceClients: Map<InstanceKey, number>
	beforeEach(async () => {
		const uniqueInstance: {
			[FORBIDDEN_WORKER_PORT]: typeof forbidden_WorkerPort
			portManager: typeof portManager
		} = await importUnique('./port_manager')
		instances =
			// @ts-expect-error instances is private, but in this case it's convenient to see it anyway
			uniqueInstance[FORBIDDEN_WORKER_PORT].instances
		activeInstanceClients =
			// @ts-expect-error instances is private, but in this case it's convenient to see it anyway
			uniqueInstance[FORBIDDEN_WORKER_PORT].activeInstanceClients

		uniqueInstance.portManager.init()
	})
	describe('unusual cases', () => {
		it('does not modify static properties if init never happened', ({
			skip
		}) => {
			const instancesSetMock = vi.spyOn(instances, 'set')
			const activeInstanceClientsSetMock = vi.spyOn(
				activeInstanceClients,
				'set'
			)

			if (!ctx.onconnect) return skip()
			ctx.onconnect(
				new MessageEvent('connect', { ports: [new MessageChannel().port1] })
			)

			if (!setTimeoutMock.mock.lastCall) return skip("setTimeout wasn't called")
			if (typeof setTimeoutMock.mock.lastCall[0] !== 'function')
				return skip('setTimeout not called with function')

			setTimeoutMock.mock.lastCall[0]()
			expect(instancesSetMock).not.toBeCalled()
			expect(activeInstanceClientsSetMock).not.toBeCalled()
		})
		it('throws error on inconsistency with activeInstanceClients', ({
			skip
		}) => {
			if (!ctx.onconnect) return skip("ctx.onconnect wasn't set")
			const port = new MessageChannel().port1
			ctx.onconnect(new MessageEvent('connect', { ports: [port] }))
			if (!port.onmessage) return skip("port.onmessage wasn't set")
			port.onmessage(
				new MessageEvent<UpstreamWorkerMessage<unknown>>('message', {
					data: NORMAL_INIT_WORKER_MESSAGE
				})
			)

			if (!setTimeoutMock.mock.lastCall) return skip("setTimeout wasn't called")
			if (typeof setTimeoutMock.mock.lastCall[0] !== 'function')
				return skip('setTimeout not called with function')

			expect(activeInstanceClients.delete(`${SOCKET_URL}::${DB_NAME}`)).toBe(
				true
			)
			expect(setTimeoutMock.mock.lastCall[0]).toThrow(InternalStateError)
		})
	})
	describe('normal cases', () => {
		function createAndInit(data: InstanceData): boolean {
			if (!ctx.onconnect) return false
			const port = new MessageChannel().port1
			ctx.onconnect(new MessageEvent('connect', { ports: [port] }))
			if (!port.onmessage) return false
			port.onmessage(
				new MessageEvent<UpstreamWorkerMessage<unknown>>('message', {
					data: {
						type: UpstreamWorkerMessageType.Init,
						data
					}
				})
			)

			return Boolean(setTimeoutMock.mock.lastCall)
		}

		it('removes the correct instance with clients: (1) this instance', ({
			skip
		}) => {
			if (
				!createAndInit({
					wsUrl: SOCKET_URL,
					dbName: DB_NAME
				})
			)
				return skip('failed to createAndInit')
			const call = setTimeoutMock.mock.lastCall
			if (!call) return skip('no lastCall')
			const symbolDestroy = call[0]

			symbolDestroy()

			expect(instances.size).toBe(0)
			expect(activeInstanceClients.size).toBe(0)
		})
		it('removes the correct instance with clients: (1) this instance, (1) another instance', ({
			skip
		}) => {
			for (let i = 0; i <= 1; i++) {
				if (
					!createAndInit({
						wsUrl: SOCKET_URL,
						// The final one needs to be the one we're deleting
						dbName: i === 0 ? DB_NAME + 'Plus' : DB_NAME
					})
				)
					return skip('failed to createAndInit')
			}
			const call = setTimeoutMock.mock.lastCall
			if (!call) return skip('no lastCall')
			const symbolDestroy = call[0]

			symbolDestroy()

			expect(instances.size).toBe(1)
			expect(instances.get(`${SOCKET_URL}::${DB_NAME}`)).toBeUndefined()
			expect(instances.get(`${SOCKET_URL}::${DB_NAME}Plus`)).toBeTypeOf(
				'object'
			)
			expect(activeInstanceClients.size).toBe(1)
			expect(
				activeInstanceClients.get(`${SOCKET_URL}::${DB_NAME}`)
			).toBeUndefined()
			expect(activeInstanceClients.get(`${SOCKET_URL}::${DB_NAME}Plus`)).toBe(1)
		})
		it('does not remove any instances with clients: (2) this instance', ({
			skip
		}) => {
			for (let i = 0; i <= 1; i++) {
				if (
					!createAndInit({
						wsUrl: SOCKET_URL,
						dbName: DB_NAME
					})
				)
					return skip('failed to createAndInit')
			}
			const call = setTimeoutMock.mock.lastCall
			if (!call) return skip('no lastCall')
			const symbolDestroy = call[0]

			symbolDestroy()

			expect(instances.size).toBe(1)
			expect(instances.get(`${SOCKET_URL}::${DB_NAME}`)).toBeTypeOf('object')
			expect(activeInstanceClients.size).toBe(1)
			expect(activeInstanceClients.get(`${SOCKET_URL}::${DB_NAME}`)).toBe(1)
		})
	})
})
