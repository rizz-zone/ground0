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
const instantiate = vi
	.spyOn(WebAssembly, 'instantiate')
	.mockImplementation((...params: Parameters<typeof instantiateImpl>) =>
		instantiateImpl(...params)
	)

let pullWasmBinaryImpl: Parameters<typeof createModule>[0]
const pullWasmBinary = vi
	.fn()
	.mockImplementation((...params: Parameters<typeof pullWasmBinaryImpl>) =>
		pullWasmBinaryImpl(...params)
	)

const { createModule } = await import('./create_module')

const instance = 3495
let wasm: ArrayBuffer

beforeEach(() => {
	SQLiteESMFactoryImpl = pullWasmBinaryImpl = async () => {
		wasm = new ArrayBuffer()
		return wasm
	}
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
			instantiateImpl = () =>
				new Promise(() => {}) as unknown as Promise<WebAssembly.Instance> &
					Promise<WebAssembly.WebAssemblyInstantiatedSource>
			expect(
				instantiateWasm(
					{ a: 'b' } as unknown as WebAssembly.Imports,
					successCallback
				)
			).toStrictEqual({})
		})
		test('calls WebAssembly.instantiate to create an instance correctly', () => {
			const then = vi.fn()
			instantiateImpl = () =>
				({ then }) as unknown as Promise<WebAssembly.Instance> &
					Promise<WebAssembly.WebAssemblyInstantiatedSource>
			instantiateWasm(
				{ a: 'b' } as unknown as WebAssembly.Imports,
				successCallback
			)
			expect(instantiate).toHaveBeenCalledOnce()
			const instantiateCall = instantiate.mock.lastCall
			if (!instantiateCall) throw new Error()
			expect(instantiateCall[0]).toStrictEqual(wasm)
			expect(instantiateCall[1]).toStrictEqual({ a: 'b' })
			expect(then).toHaveBeenCalledOnce()
			const thenCall = then.mock.lastCall
			if (!thenCall) throw new Error()
			expect(thenCall[0]).toBeTypeOf('function')
		})
		test('.then callback calls successCallback', ({ skip }) => {
			const then = vi.fn()
			instantiateImpl = () =>
				({ then }) as unknown as Promise<WebAssembly.Instance> &
					Promise<WebAssembly.WebAssemblyInstantiatedSource>
			instantiateWasm(
				{ a: 'b' } as unknown as WebAssembly.Imports,
				successCallback
			)

			const thenCall = then.mock.lastCall
			if (!thenCall) return skip()
			expect(successCallback).not.toHaveBeenCalled()
			const instance = {} as WebAssembly.Instance
			thenCall[0]({ instance })
			expect(successCallback).toHaveBeenCalledExactlyOnceWith(instance)
		})
	})
})
