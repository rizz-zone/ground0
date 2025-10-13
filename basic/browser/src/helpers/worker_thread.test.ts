import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defs, type TestingTransition } from '@ground0/shared'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'

type OriginalConnectDb = (typeof import('@/resource_managers/db'))['connectDb']
let connectDbImpl = (() => new Promise(() => {})) as OriginalConnectDb
const connectDb = vi
	.fn()
	.mockImplementation((...params: Parameters<OriginalConnectDb>) =>
		connectDbImpl(...params)
	)
vi.doMock('@/resource_managers/db', () => ({ connectDb }))

type OriginalConnectWs = (typeof import('@/resource_managers/ws'))['connectWs']
let connectWsImpl = (() => new Promise(() => {})) as OriginalConnectWs
const connectWs = vi
	.fn()
	.mockImplementation((...params: Parameters<OriginalConnectWs>) =>
		connectWsImpl(...params)
	)
vi.doMock('@/resource_managers/ws', () => ({ connectWs }))

type OriginalCreateMemoryModel =
	(typeof import('./memory_model'))['createMemoryModel']
let createMemoryModelImpl = (() =>
	({}) as unknown as ReturnType<
		typeof createMemoryModel
	>) as OriginalCreateMemoryModel
const createMemoryModel = vi
	.fn()
	.mockImplementation((...params: Parameters<OriginalCreateMemoryModel>) =>
		createMemoryModelImpl(...params)
	)
vi.doMock('@/helpers/memory_model', () => ({ createMemoryModel }))

const announceTransformation = vi.fn()
const pullWasmBinary = vi.fn()

beforeEach(vi.clearAllMocks)
afterEach(() => {
	connectDbImpl = () => new Promise(() => {})
	connectWsImpl = () => new Promise(() => {})
	createMemoryModelImpl = () =>
		({}) as unknown as ReturnType<typeof createMemoryModel>
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
		it('calls connectWs', () => {
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
	})
})
