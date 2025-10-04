import { beforeEach, test, vi, expect, describe } from 'vitest'
import { createModule } from './create_module'

type OriginalSQLiteESMFactoryImpl =
	typeof import('wa-sqlite/dist/wa-sqlite.mjs')

let SQLiteESMFactoryImpl: OriginalSQLiteESMFactoryImpl
const SQLiteESMFactory = vi.fn()
vi.mock('wa-sqlite/dist/wa-sqlite.mjs', () => SQLiteESMFactory)

let pullWasmBinaryImpl: Parameters<typeof createModule>[0]
const pullWasmBinary = vi
	.fn()
	.mockImplementation((...params: Parameters<typeof pullWasmBinaryImpl>) =>
		pullWasmBinaryImpl(...params)
	)

beforeEach(() => {
	pullWasmBinaryImpl = async () => new ArrayBuffer()
	vi.clearAllMocks()
})

test('runs pullWasmBinary and awaits its result', () => {
	const then = vi.fn()
	pullWasmBinaryImpl = () => ({ then }) as unknown as Promise<ArrayBuffer>
	createModule(pullWasmBinary)
	expect(pullWasmBinary).toHaveBeenCalledOnce()
	expect(then).toHaveBeenCalledOnce()
	if (!then.mock.lastCall) throw new Error()
	expect(then.mock.lastCall[0]).toBeTypeOf('function')
})
describe('pullWasmBinary promise callback', ({ skip }) => {
	const then = vi.fn()
	let callback: (wasm: ArrayBuffer) => ReturnType<OriginalSQLiteESMFactoryImpl>
	beforeEach(() => {
		pullWasmBinaryImpl = () => ({ then }) as unknown as Promise<ArrayBuffer>
		createModule(pullWasmBinary)
		if (!then.mock.lastCall) return skip('.then is not called with a callback!')
		callback = then.mock.lastCall[0]
	})
})
