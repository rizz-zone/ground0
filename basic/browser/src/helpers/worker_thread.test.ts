import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defs, type TestingTransition } from '@ground0/shared'

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
		createMemoryModelImpl = () => output as ReturnType<typeof createMemoryModel>
		const workerLocalFirst = new WorkerLocalFirst({ ...baseInput })
		expect(createMemoryModel).toHaveBeenCalledExactlyOnceWith(
			baseInput.initialMemoryModel,
			baseInput.announceTransformation
		)
		expect(workerLocalFirst.memoryModel).toBe(output)
	})
})
