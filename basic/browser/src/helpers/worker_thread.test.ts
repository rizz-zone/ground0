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
	DownstreamWsMessageAction,
	TransitionImpact,
	type DownstreamWsMessage,
	type Update
} from '@ground0/shared'
import { defs, type TestingTransition } from '@ground0/shared/testing'
import { WsResourceStatus } from '../types/status/WsResourceStatus'
import type { ResourceBundle } from '../types/status/ResourceBundle'
import { DbResourceStatus } from '../types/status/DbResourceStatus'
import SuperJSON from 'superjson'
import type { OptimisticPushTransitionRunner } from '../runners/specialised/optimistic_push'
import type {
	TransitionRunnerInputIngredients,
	TransitionRunner
} from '../runners/base'
import type { LocalEngineDefinition } from '../types/LocalEngineDefinition'
import type { Transformation } from '../types/memory_model/Tranformation'

// Mock DbThinClient
const newPortMock = vi.fn()
const DbThinClientMock = vi.fn().mockImplementation(() => ({
	newPort: newPortMock
}))
vi.doMock('@/resource_managers/db', () => ({ DbThinClient: DbThinClientMock }))

type OriginalConnectWs = (typeof import('../resource_managers/ws'))['connectWs']
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
vi.doMock('./memory_model', () => ({ createMemoryModel }))

type OriginalBrandedLog = (typeof import('../common/branded_log'))['brandedLog']
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
) as unknown as (typeof import('../runners/all'))['runners']
vi.doMock('@/runners/all', () => ({ runners }))

const announceTransformation = vi.fn()

beforeEach(() => {
	vi.clearAllMocks()

	connectWsImpl = () => new Promise(() => {})
	createMemoryModelImpl = () =>
		({}) as unknown as ReturnType<typeof createMemoryModel>
	brandedLogImpl = () => {}

	// Reset DbThinClient mock
	DbThinClientMock.mockClear()
	newPortMock.mockClear()
})

const WorkerLocalFirst = (await import('./worker_thread')).WorkerLocalFirst

type TestMemoryModel = { [key: string]: never }
type TestUpdate = Update

// Use LocalEngineDefinition to type baseInput correctly
const baseInput: LocalEngineDefinition<
	TestMemoryModel,
	TestingTransition,
	TestUpdate
> & {
	announceTransformation: (transformation: Transformation) => unknown
} = {
	wsUrl: 'wss://abc.xyz/socket',
	dbName: 'db',
	engineDef: defs,
	initialMemoryModel: {},
	announceTransformation,
	localTransitionHandlers: {
		shift_foo_bar: {
			editDb: vi.fn()
		},
		3: {
			editMemoryModel: vi.fn(),
			revertMemoryModel: vi.fn()
		}
	},
	updateHandlers: {} as unknown as (typeof baseInput)['updateHandlers']
}

const sharedCtx = self as unknown as SharedWorkerGlobalScope
// const dedicatedCtx = self as DedicatedWorkerGlobalScope

describe('always', () => {
	describe('constructor', () => {
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

		it('initializes autoTransitions if provided', async () => {
			const onInit = {
				impact: TransitionImpact.OptimisticPush,
				action: 'shift_foo_bar'
			} as unknown as TestingTransition
			const workerLocalFirst = new WorkerLocalFirst({
				...baseInput,
				autoTransitions: {
					onInit
				}
			})
			expect(workerLocalFirst).toBeDefined()

			// Wait for microtask
			await Promise.resolve()

			expect(runners[TransitionImpact.OptimisticPush]).toHaveBeenCalled()
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
		it('syncs transition runners on changes', () => {
			const mockRunners = Array.from(
				{ length: 10 },
				() =>
					({ syncResources: vi.fn() }) as unknown as TransitionRunner<
						object,
						TransitionImpact,
						TestingTransition
					>
			)
			const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })

			for (const [index, runner] of Object.entries(mockRunners)) {
				// @ts-expect-error We need to access private members
				workerLocalFirst.transitionRunners.set(Number(index), runner)
				expect(runner.syncResources).not.toHaveBeenCalled()
			}

			const newWsResource = {
				status: WsResourceStatus.Connected,
				instance: {}
			} as ResourceBundle['ws']

			// @ts-expect-error We need to access private members
			workerLocalFirst.syncResources({ ws: newWsResource })

			for (const runner of mockRunners) {
				expect(runner.syncResources).toHaveBeenCalledOnce()
				const call = (runner.syncResources as ReturnType<typeof vi.fn>).mock
					.lastCall as
					| Parameters<
							TransitionRunner<
								object,
								TransitionImpact,
								TestingTransition
							>['syncResources']
					  >
					| undefined
				if (!call) throw new Error()
				expect(call[0].ws).toBe(newWsResource)
			}
		})

		it('triggers autoTransitions on db connect', async () => {
			const onDbConnect = {
				impact: TransitionImpact.OptimisticPush,
				action: 'shift_foo_bar'
			} as unknown as TestingTransition
			const workerLocalFirst = new WorkerLocalFirst({
				...baseInput,
				autoTransitions: {
					onDbConnect
				}
			})

			// clear runners
			vi.mocked(runners[TransitionImpact.OptimisticPush]).mockClear()

			// @ts-expect-error Accessing private member for testing
			workerLocalFirst.syncResources({
				db: {
					status: DbResourceStatus.ConnectedAndMigrated,
					instance: {}
				} as ResourceBundle['db']
			})

			await Promise.resolve()
			expect(runners[TransitionImpact.OptimisticPush]).toHaveBeenCalled()
		})

		it('triggers autoTransitions on ws connect', async () => {
			const onWsConnect = {
				everyTime: {
					impact: TransitionImpact.OptimisticPush,
					action: 'shift_foo_bar'
				} as unknown as TestingTransition
			}
			const workerLocalFirst = new WorkerLocalFirst({
				...baseInput,
				autoTransitions: {
					onWsConnect
				}
			})

			vi.mocked(runners[TransitionImpact.OptimisticPush]).mockClear()

			// @ts-expect-error Accessing private member for testing
			workerLocalFirst.syncResources({
				ws: {
					status: WsResourceStatus.Connected,
					instance: {}
				} as ResourceBundle['ws']
			})

			await Promise.resolve()
			expect(runners[TransitionImpact.OptimisticPush]).toHaveBeenCalled()
		})
	})
	describe('handleMessage', () => {
		describe('warns and otherwise does nothing on entirely invalid input', () => {
			test('ArrayBuffer', () => {
				const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
				expect(brandedLog).not.toHaveBeenCalled()

				const arrayBuffer = new ArrayBuffer(0)

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
		test('warns and otherwise does nothing on actions not in enum', () => {
			const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
			for (const [index, action] of Object.entries([
				-1,
				(Object.values(
					DownstreamWsMessageAction as unknown as Record<string, number> &
						Record<number, string>
				).reduce(
					(acc, current) =>
						typeof current === 'number' && current > (acc as number)
							? current
							: acc,
					0
				) as number) + 1
			])) {
				const i = Number(index)
				expect(brandedLog).toHaveBeenCalledTimes(i)

				const messageObj = {
					action
				}
				const messageContent = SuperJSON.stringify(messageObj)

				// @ts-expect-error We need to access private members
				workerLocalFirst.handleMessage(
					new MessageEvent('message', { data: messageContent })
				)

				expect(brandedLog).toHaveBeenCalledTimes(i + 1)
				const call = brandedLog.mock.lastCall
				if (!call) throw new Error()
				expect(call[0]).toBe(console.warn)
				expect(call[2]).toStrictEqual(messageObj)
			}
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
									} as unknown as DownstreamWsMessage)
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
						} as unknown as OptimisticPushTransitionRunner<
							object,
							TestingTransition & { impact: TransitionImpact.OptimisticPush }
						>
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
								} as unknown as DownstreamWsMessage)
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

				workerLocalFirst.transition({
					impact,
					action: 'shift_foo_bar'
				} as unknown as TestingTransition)
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
				workerLocalFirst.transition({
					impact,
					action: 'shift_foo_bar'
				} as unknown as TestingTransition)

				expect(runners[impact]).toHaveBeenCalledOnce()
			}
		})
		test('provides a markComplete function to constructors that removes the runner from the map', ({
			skip
		}) => {
			for (const impact of Object.values(TransitionImpact).filter(
				(v) => typeof v === 'number'
			)) {
				expect(runners[impact]).not.toHaveBeenCalled()

				const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
				workerLocalFirst.transition({
					impact,
					action: 'shift_foo_bar'
				} as unknown as TestingTransition)

				const call = (runners[impact] as ReturnType<typeof vi.fn>).mock
					.lastCall as
					| undefined
					| [
							TransitionRunnerInputIngredients<
								object,
								TransitionImpact,
								TestingTransition
							>
					  ]
				if (!call) return skip()

				expect(call[0].markComplete).toBeTypeOf('function')

				// @ts-expect-error We need to access private members
				expect(workerLocalFirst.transitionRunners.size).toBe(1)
				call[0].markComplete()
				// @ts-expect-error We need to access private members
				expect(workerLocalFirst.transitionRunners.size).toBe(0)
			}
		})
	})
})

describe('shared worker', () => {
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
		test('instantiates DbThinClient correctly', () => {
			new WorkerLocalFirst({ ...baseInput })
			expect(DbThinClientMock).toHaveBeenCalledOnce()

			if (!DbThinClientMock.mock.lastCall)
				throw new Error('DbThinClient not called')

			const call = DbThinClientMock.mock.lastCall[0]
			expect(call.dbName).toBe(baseInput.dbName)
			expect(call.migrations).toBe(baseInput.engineDef.db.migrations)
			expect(call.syncResources).toBeTypeOf('function')
		})

		test('newPort forwards to dbThinClient', () => {
			const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
			const port = {} as MessagePort
			workerLocalFirst.newPort(port)
			expect(newPortMock).toHaveBeenCalledWith(port)
		})
	})
})

describe('dedicated worker', () => {
	describe('constructor', () => {
		test('sets resourceBundle.db.status to NeverConnecting', () => {
			const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
			// @ts-expect-error We need to access private members
			expect(workerLocalFirst.resourceBundle.db.status).toBe(
				DbResourceStatus.NeverConnecting
			)
		})
		test('does not instantiate DbThinClient', () => {
			new WorkerLocalFirst({ ...baseInput })
			expect(DbThinClientMock).not.toHaveBeenCalled()
		})

		test('newPort does not crash (and does nothing) when dbThinClient is missing', () => {
			const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
			const port = {} as MessagePort
			expect(() => workerLocalFirst.newPort(port)).not.toThrow()
			expect(newPortMock).not.toHaveBeenCalled()
		})
	})
})
