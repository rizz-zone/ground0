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

const announceTransformation = vi.fn()
const pullWasmBinary = vi.fn()

beforeEach(vi.clearAllMocks)
afterEach(() => {
	connectDbImpl = () => new Promise(() => {})
	connectWsImpl = () => new Promise(() => {})
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
})
