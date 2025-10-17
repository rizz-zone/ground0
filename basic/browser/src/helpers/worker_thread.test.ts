import {
	describe,
	it,
	expect,
	vi,
	beforeEach,
	test,
	beforeAll,
	afterAll
} from 'vitest'
import {
	defs,
	DownstreamWsMessageAction,
	TransitionImpact,
	type DownstreamWsMessage,
	type TestingTransition
} from '@ground0/shared'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import SuperJSON from 'superjson'
import type { OptimisticPushTransitionRunner } from '@/runners/specialised/optimistic_push'

type OriginalConnectDb = (typeof import('@/resource_managers/db'))['connectDb']
let connectDbImpl: OriginalConnectDb
const connectDb = vi
	.fn()
	.mockImplementation((...params: Parameters<OriginalConnectDb>) =>
		connectDbImpl(...params)
	)
vi.doMock('@/resource_managers/db', () => ({ connectDb }))

type OriginalConnectWs = (typeof import('@/resource_managers/ws'))['connectWs']
let connectWsImpl: OriginalConnectWs
const connectWs = vi
	.fn()
	.mockImplementation((...params: Parameters<OriginalConnectWs>) =>
		connectWsImpl(...params)
	)
vi.doMock('@/resource_managers/ws', () => ({ connectWs }))

type OriginalCreateMemoryModel =
	(typeof import('./memory_model'))['createMemoryModel']
let createMemoryModelImpl: OriginalCreateMemoryModel
const createMemoryModel = vi
	.fn()
	.mockImplementation((...params: Parameters<OriginalCreateMemoryModel>) =>
		createMemoryModelImpl(...params)
	)
vi.doMock('@/helpers/memory_model', () => ({ createMemoryModel }))

type OriginalBrandedLog = (typeof import('@/common/branded_log'))['brandedLog']
let brandedLogImpl: OriginalBrandedLog
const brandedLog = vi
	.fn()
	.mockImplementation((...params: Parameters<OriginalBrandedLog>) =>
		brandedLogImpl(...params)
	)
vi.doMock('@/common/branded_log', () => ({ brandedLog }))

const runners = Object.fromEntries(
	Object.values(TransitionImpact)
		.filter((v) => typeof v === 'number')
		.map((impact, idx) => [impact, vi.fn().mockName(`runner_${impact}_${idx}`)])
) as unknown as (typeof import('@/runners/all'))['runners']
vi.doMock('@/runners/all', () => ({ runners }))

const announceTransformation = vi.fn()
const pullWasmBinary = vi.fn()

beforeEach(() => {
	vi.clearAllMocks()

	connectDbImpl = () => new Promise(() => {})
	connectWsImpl = () => new Promise(() => {})
	createMemoryModelImpl = () =>
		({}) as unknown as ReturnType<typeof createMemoryModel>
	brandedLogImpl = () => {}
})

const WorkerLocalFirst = (await import('./worker_thread')).WorkerLocalFirst

const baseInput: ConstructorParameters<
	typeof WorkerLocalFirst<{ [key: string]: never }, TestingTransition>
>[0] = {
	wsUrl: 'wss://abc.xyz/socket',
	dbName: 'db',
	engineDef: defs,
	initialMemoryModel: {},
	announceTransformation,
	pullWasmBinary,
	localHandlers: {
		shift_foo_bar: {
			editDb: vi.fn()
		},
		3: {
			editMemoryModel: vi.fn(),
			revertMemoryModel: vi.fn()
		}
	}
}

const sharedCtx = self as unknown as SharedWorkerGlobalScope
// const dedicatedCtx = self as DedicatedWorkerGlobalScope

describe('always', () => {
	describe('constructor', () => {
		it('sets engineDef', () => {
			const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
			// @ts-expect-error We need to access private members
			expect(workerLocalFirst.engineDef).toBe(baseInput.engineDef)
		})
		it('sets localHandlers', () => {
			const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
			// @ts-expect-error We need to access private members
			expect(workerLocalFirst.localHandlers).toBe(baseInput.localHandlers)
		})
		it('sets memoryModel using output of createMemoryModel', () => {
			const output = {}
			createMemoryModelImpl = () =>
				output as ReturnType<typeof createMemoryModel>
			const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
			expect(createMemoryModel).toHaveBeenCalledExactlyOnceWith(
				baseInput.initialMemoryModel,
				baseInput.announceTransformation
			)
			expect(workerLocalFirst.memoryModel).toBe(output)
		})
		it('sets resourceBundle.ws.status to Disconnected', () => {
			const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
			// @ts-expect-error We need to access private members
			expect(workerLocalFirst.resourceBundle.ws.status).toBe(
				WsResourceStatus.Disconnected
			)
		})
		it('calls connectWs correctly', () => {
			new WorkerLocalFirst({ ...baseInput })
			expect(connectWs).toHaveBeenCalledOnce()

			if (!connectWs.mock.lastCall || connectWs.mock.lastCall.length === 0)
				throw new Error()
			const call = connectWs.mock
				.lastCall[0] as Parameters<OriginalConnectWs>[0]

			expect(call.wsUrl).toBe(baseInput.wsUrl)
			expect(call.currentVersion).toBe(baseInput.engineDef.version.current)
			expect(call.handleMessage).toBeTypeOf('function')
			expect(call.syncResources).toBeTypeOf('function')
		})
	})
	describe('syncResources', () => {
		it('does nothing no resource changes have been provided', () => {
			const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
			// @ts-expect-error We need to access private members
			const originalDbResource = workerLocalFirst.resourceBundle.db
			// @ts-expect-error We need to access private members
			const originalWsResource = workerLocalFirst.resourceBundle.ws
			const values = vi.fn().mockImplementation(() => [])
			// @ts-expect-error We need to access private members
			workerLocalFirst.transitionRunners.values = values

			// @ts-expect-error We need to access private members
			workerLocalFirst.syncResources({})

			// @ts-expect-error We need to access private members
			expect(workerLocalFirst.resourceBundle.db).toBe(originalDbResource)
			// @ts-expect-error We need to access private members
			expect(workerLocalFirst.resourceBundle.ws).toBe(originalWsResource)
			expect(values).not.toHaveBeenCalled()
		})
		describe('updates the resourceBundle correctly and cycles through transition runners once', () => {
			it('on db change', () => {
				const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
				// @ts-expect-error We need to access private members
				const originalWsResource = workerLocalFirst.resourceBundle.ws
				const values = vi.fn().mockImplementation(() => [])
				// @ts-expect-error We need to access private members
				workerLocalFirst.transitionRunners.values = values

				const newDbResource = {
					status: DbResourceStatus.ConnectedAndMigrated,
					instance: {}
				} as ResourceBundle['db']

				// @ts-expect-error We need to access private members
				workerLocalFirst.syncResources({ db: newDbResource })

				// @ts-expect-error We need to access private members
				expect(workerLocalFirst.resourceBundle.db).toBe(newDbResource)
				// @ts-expect-error We need to access private members
				expect(workerLocalFirst.resourceBundle.ws).toBe(originalWsResource)
				expect(values).toHaveBeenCalledOnce()
			})
			it('on ws change', () => {
				const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
				// @ts-expect-error We need to access private members
				const originalDbResource = workerLocalFirst.resourceBundle.db
				const values = vi.fn().mockImplementation(() => [])
				// @ts-expect-error We need to access private members
				workerLocalFirst.transitionRunners.values = values

				const newWsResource = {
					status: WsResourceStatus.Connected,
					instance: {}
				} as ResourceBundle['ws']

				// @ts-expect-error We need to access private members
				workerLocalFirst.syncResources({ ws: newWsResource })

				// @ts-expect-error We need to access private members
				expect(workerLocalFirst.resourceBundle.db).toBe(originalDbResource)
				// @ts-expect-error We need to access private members
				expect(workerLocalFirst.resourceBundle.ws).toBe(newWsResource)
				expect(values).toHaveBeenCalledOnce()
			})
			it('when both db and ws change', () => {
				const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
				const values = vi.fn().mockImplementation(() => [])
				// @ts-expect-error We need to access private members
				workerLocalFirst.transitionRunners.values = values

				const newDbResource = {
					status: DbResourceStatus.ConnectedAndMigrated,
					instance: {}
				} as ResourceBundle['db']

				const newWsResource = {
					status: WsResourceStatus.Connected,
					instance: {}
				} as ResourceBundle['ws']

				// @ts-expect-error We need to access private members
				workerLocalFirst.syncResources({ db: newDbResource, ws: newWsResource })

				// @ts-expect-error We need to access private members
				expect(workerLocalFirst.resourceBundle.db).toBe(newDbResource)
				// @ts-expect-error We need to access private members
				expect(workerLocalFirst.resourceBundle.ws).toBe(newWsResource)
				expect(values).toHaveBeenCalledOnce()
			})
		})
	})
	describe('handleMessage', () => {
		describe('warns and otherwise does nothing on invalid input', () => {
			test('ArrayBuffer', () => {
				const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
				expect(brandedLog).not.toHaveBeenCalled()

				const arrayBuffer = new ArrayBuffer()

				// @ts-expect-error We need to access private members
				workerLocalFirst.handleMessage(
					new MessageEvent('message', { data: arrayBuffer })
				)

				expect(brandedLog).toHaveBeenCalledOnce()
				const call = brandedLog.mock.lastCall
				if (!call) throw new Error()
				expect(call[0]).toBe(console.warn)
				expect(call[2]).toBe(arrayBuffer)
			})
			test('Blob', () => {
				const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
				expect(brandedLog).not.toHaveBeenCalled()

				const blob = new Blob()

				// @ts-expect-error We need to access private members
				workerLocalFirst.handleMessage(
					new MessageEvent('message', { data: blob })
				)

				expect(brandedLog).toHaveBeenCalledOnce()
				const call = brandedLog.mock.lastCall
				if (!call) throw new Error()
				expect(call[0]).toBe(console.warn)
				expect(call[2]).toBe(blob)
			})
			test('empty string', () => {
				const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
				expect(brandedLog).not.toHaveBeenCalled()

				// @ts-expect-error We need to access private members
				workerLocalFirst.handleMessage(
					new MessageEvent('message', { data: '' })
				)

				expect(brandedLog).toHaveBeenCalledOnce()
				const call = brandedLog.mock.lastCall
				if (!call) throw new Error()
				expect(call[0]).toBe(console.warn)
				expect(call[2]).toBe('')
			})
			test('non-JSON string', () => {
				const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
				expect(brandedLog).not.toHaveBeenCalled()

				const nonJSONString = 'nwyufhnp98n2pulhulh;;9'

				// @ts-expect-error We need to access private members
				workerLocalFirst.handleMessage(
					new MessageEvent('message', { data: nonJSONString })
				)

				expect(brandedLog).toHaveBeenCalledOnce()
				const call = brandedLog.mock.lastCall
				if (!call) throw new Error()
				expect(call[0]).toBe(console.warn)
				expect(call[2]).toBe(nonJSONString)
			})
			test('non-SuperJSON string', () => {
				const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
				expect(brandedLog).not.toHaveBeenCalled()

				const jsonOnlyString = JSON.stringify({
					foo: 'bar',
					94: 43,
					anotherThing: { baz: 'wow' },
					action: DownstreamWsMessageAction.OptimisticCancel
				})

				// @ts-expect-error We need to access private members
				workerLocalFirst.handleMessage(
					new MessageEvent('message', { data: jsonOnlyString })
				)

				expect(brandedLog).toHaveBeenCalledOnce()
				const call = brandedLog.mock.lastCall
				if (!call) throw new Error()
				expect(call[0]).toBe(console.warn)
				expect(call[2]).toBe(jsonOnlyString)
			})
			test('SuperJSON string without action', () => {
				const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
				expect(brandedLog).not.toHaveBeenCalled()

				const actionlessJSONString = SuperJSON.stringify({
					foo: 'bar',
					94: 43,
					anotherThing: { baz: 'wow' }
				})

				// @ts-expect-error We need to access private members
				workerLocalFirst.handleMessage(
					new MessageEvent('message', { data: actionlessJSONString })
				)

				expect(brandedLog).toHaveBeenCalledOnce()
				const call = brandedLog.mock.lastCall
				if (!call) throw new Error()
				expect(call[0]).toBe(console.warn)
				expect(call[2]).toBe(actionlessJSONString)
			})
		})
		describe('normal messages', () => {
			for (const action of [
				DownstreamWsMessageAction.OptimisticCancel,
				DownstreamWsMessageAction.OptimisticResolve
			])
				describe(DownstreamWsMessageAction[action], () => {
					test('calls transitionRunners.get with the id', () => {
						const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
						const transitionRunnersGet = vi.fn()
						// @ts-expect-error We need to access private members
						workerLocalFirst.transitionRunners.get = transitionRunnersGet

						expect(() =>
							// @ts-expect-error We need to access private members
							workerLocalFirst.handleMessage(
								new MessageEvent('message', {
									data: SuperJSON.stringify({
										action,
										id: 0
									} satisfies DownstreamWsMessage)
								})
							)
						).not.toThrow()
						expect(transitionRunnersGet).toHaveBeenCalledExactlyOnceWith(0)
					})
					test('reports success or failure if the transition runner is found', ({
						skip
					}) => {
						const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })

						const mockRunner = {
							reportWsResult: vi.fn()
						} as unknown as OptimisticPushTransitionRunner<object>
						const transitionRunnersGet = vi
							.fn()
							.mockImplementation((id) => (id === 0 ? mockRunner : skip()))
						// @ts-expect-error We need to access private members
						workerLocalFirst.transitionRunners.get = transitionRunnersGet

						// @ts-expect-error We need to access private members
						workerLocalFirst.handleMessage(
							new MessageEvent('message', {
								data: SuperJSON.stringify({
									action,
									id: 0
								} satisfies DownstreamWsMessage)
							})
						)

						expect(transitionRunnersGet).toHaveBeenCalledExactlyOnceWith(0)
						expect(mockRunner.reportWsResult).toHaveBeenCalledExactlyOnceWith(
							action === DownstreamWsMessageAction.OptimisticResolve
						)
					})
				})
		})
	})
	describe('transition', () => {
		test("rejects transition impacts that don't exist", () => {
			for (const [index, impact] of Object.entries([
				-1,
				(Object.values(
					TransitionImpact as unknown as Record<string, number> &
						Record<number, string>
				).reduce(
					(acc, current) =>
						typeof current === 'number' && current > (acc as number)
							? current
							: acc,
					0
				) as number) + 1
			])) {
				const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
				const transitionRunnersSet = vi.fn()
				// @ts-expect-error We need to access private members
				workerLocalFirst.transitionRunners.set = transitionRunnersSet

				workerLocalFirst.transition({ impact, action: 'shift_foo_bar' })
				expect(brandedLog).toHaveBeenCalledTimes(Number(index) + 1)
				expect(transitionRunnersSet).not.toHaveBeenCalled()
			}
		})
		test('constructs transitions with valid impacts', () => {
			for (const impact of Object.values(TransitionImpact).filter(
				(v) => typeof v === 'number'
			)) {
				expect(runners[impact]).not.toHaveBeenCalled()

				const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
				// @ts-expect-error We don't need a definition of everything
				workerLocalFirst.transition({ impact, action: 'shift_foo_bar' })

				expect(runners[impact]).toHaveBeenCalledOnce()
			}
		})
	})
})
describe('SharedWorker', () => {
	beforeAll(() => {
		sharedCtx.onconnect = null
	})
	afterAll(() => {
		// @ts-expect-error TS will never understand our objectives
		delete sharedCtx.onconnect
	})
	describe('constructor', () => {
		test('sets resourceBundle.db.status to Disconnected', () => {
			const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
			// @ts-expect-error We need to access private members
			expect(workerLocalFirst.resourceBundle.db.status).toBe(
				DbResourceStatus.Disconnected
			)
		})
		test('calls connectDb correctly', () => {
			new WorkerLocalFirst({ ...baseInput })
			expect(connectDb).toHaveBeenCalledOnce()

			if (!connectDb.mock.lastCall || connectDb.mock.lastCall.length === 0)
				throw new Error()
			const call = connectDb.mock
				.lastCall[0] as Parameters<OriginalConnectDb>[0]

			expect(call.dbName).toBe(baseInput.dbName)
			expect(call.migrations).toBe(baseInput.engineDef.db.migrations)
			expect(call.pullWasmBinary).toBeTypeOf('function')
			expect(call.syncResources).toBeTypeOf('function')
		})
	})
})
