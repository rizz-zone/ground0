import { beforeEach, test, vi, expect, describe } from 'vitest'

type OriginalSQLiteESMFactoryImpl =
	typeof import('wa-sqlite/dist/wa-sqlite.mjs')

let SQLiteESMFactoryImpl: OriginalSQLiteESMFactoryImpl
const SQLiteESMFactory = vi
	.fn()
	.mockImplementation((...params: Parameters<typeof SQLiteESMFactoryImpl>) =>
		SQLiteESMFactoryImpl(...params)
	)
vi.doMock('wa-sqlite/dist/wa-sqlite.mjs', () => ({ default: SQLiteESMFactory }))
let instantiateImpl: typeof WebAssembly.instantiate
vi.spyOn(WebAssembly, 'instantiate').mockImplementation(
	(...params: Parameters<typeof instantiateImpl>) => instantiateImpl(...params)
)

let pullWasmBinaryImpl: Parameters<typeof createModule>[0]
const pullWasmBinary = vi
	.fn()
	.mockImplementation((...params: Parameters<typeof pullWasmBinaryImpl>) =>
		pullWasmBinaryImpl(...params)
	)

const { createModule } = await import('./create_module')

const instance = 3495

beforeEach(() => {
	SQLiteESMFactoryImpl = pullWasmBinaryImpl = async () => new ArrayBuffer()
	instantiateImpl = async () =>
		({ instance }) as unknown as WebAssembly.Instance &
			WebAssembly.WebAssemblyInstantiatedSource

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

	test('calls SQLiteESMFactory correctly and returns its promise', async () => {
		SQLiteESMFactoryImpl = () => Promise.resolve(948)
		await expect(callback(new ArrayBuffer())).resolves.toBe(948)
		expect(SQLiteESMFactory).toHaveBeenCalledOnce()

		const call = SQLiteESMFactory.mock.lastCall
		if (!call) throw new Error()
		expect(call[0]).toBeTypeOf('object')
		expect(
			(call[0] as { [key: string]: unknown })['instantiateWasm']
		).toBeTypeOf('function')
	})
	describe('instantiateWasm', ({ skip }) => {
		const successCallback = vi.fn()
		let instantiateWasm: (
			imports: WebAssembly.Imports,
			successCallback: (instance: WebAssembly.Instance) => void
		) => unknown
		beforeEach(() => {
			callback(new ArrayBuffer())
			const call = SQLiteESMFactory.mock.lastCall
			if (
				!call ||
				typeof call[0] !== 'object' ||
				typeof call[0].instantiateWasm !== 'function'
			)
				return skip('No proper instantiateWasm was provided')
			;({ instantiateWasm } = call[0])
		})
		test('returns empty object', () => {
			// @ts-expect-error we don't use this anyway and it can hang
			instantiateImpl = () => new Promise(() => {})
			expect(
				instantiateWasm(
					{ a: 'b' } as unknown as WebAssembly.Imports,
					successCallback
				)
			).toStrictEqual({})
		})
	})
})
