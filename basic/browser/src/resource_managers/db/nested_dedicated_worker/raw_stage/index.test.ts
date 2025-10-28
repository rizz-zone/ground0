/// <reference types="wa-sqlite/src/types" />

import { beforeEach, describe, expect, test, vi } from 'vitest'

// Mock dependencies
let createModuleImpl: () => unknown
const createModule = vi.fn().mockImplementation(() => createModuleImpl())
vi.doMock('./create_module', () => ({ createModule }))

let vfsCreateImpl: () => unknown
const vfsCreate = vi.fn().mockImplementation(() => vfsCreateImpl())
vi.doMock('./vfs', () => ({ OPFSCoopSyncVFS: { create: vfsCreate } }))

// Mock wa-sqlite Factory
const mockFactory = vi.fn()
vi.doMock('wa-sqlite', () => ({ Factory: mockFactory }))

const { getRawSqliteDb } = await import('./index')

const mockWasmBinary = new ArrayBuffer(1024)
const mockDbName = 'test-db'
const mockPullWasmBinary = vi.fn().mockResolvedValue(mockWasmBinary)

const mockModule = { some: 'module' }
const mockVfsRegister = vi.fn()
const mockOpenV2 = vi.fn()
const mockSqlite3 = {
	vfs_register: mockVfsRegister,
	open_v2: mockOpenV2
} as unknown as SQLiteAPI
const mockDb = 12345
const mockVfs = { name: 'opfs' } as unknown as SQLiteVFS

beforeEach(() => {
	vi.clearAllMocks()

	// Default successful implementations
	createModuleImpl = async () => mockModule
	vfsCreateImpl = async () => mockVfs
	mockFactory.mockReturnValue(mockSqlite3)
	mockOpenV2.mockResolvedValue(mockDb)
})

describe('getRawSqliteDb', () => {
	test('successfully creates database with all steps', async () => {
		const result = await getRawSqliteDb({
			pullWasmBinary: mockPullWasmBinary,
			dbName: mockDbName
		})

		expect(result).toEqual({
			sqlite3: mockSqlite3,
			db: mockDb
		})
	})

	test('calls createModule with pullWasmBinary', async () => {
		await getRawSqliteDb({
			pullWasmBinary: mockPullWasmBinary,
			dbName: mockDbName
		})

		expect(createModule).toHaveBeenCalledExactlyOnceWith(mockPullWasmBinary)
	})

	test('calls Factory with the created module', async () => {
		await getRawSqliteDb({
			pullWasmBinary: mockPullWasmBinary,
			dbName: mockDbName
		})

		expect(mockFactory).toHaveBeenCalledExactlyOnceWith(mockModule)
	})

	test('creates VFS with correct parameters', async () => {
		await getRawSqliteDb({
			pullWasmBinary: mockPullWasmBinary,
			dbName: mockDbName
		})

		expect(vfsCreate).toHaveBeenCalledExactlyOnceWith('opfs', mockModule)
	})

	test('registers VFS and sets as default', async () => {
		await getRawSqliteDb({
			pullWasmBinary: mockPullWasmBinary,
			dbName: mockDbName
		})

		expect(mockVfsRegister).toHaveBeenCalledExactlyOnceWith(mockVfs, true)
	})

	test('opens database with correct name', async () => {
		await getRawSqliteDb({
			pullWasmBinary: mockPullWasmBinary,
			dbName: mockDbName
		})

		expect(mockOpenV2).toHaveBeenCalledExactlyOnceWith(mockDbName)
	})

	describe('error handling', () => {
		test('throws error when createModule fails', async () => {
			const error = new Error('Failed to create module')
			createModuleImpl = async () => {
				throw error
			}

			await expect(
				getRawSqliteDb({
					pullWasmBinary: mockPullWasmBinary,
					dbName: mockDbName
				})
			).rejects.toThrow(error)
		})

		test('throws error when VFS creation fails', async () => {
			const error = new Error('Failed to create VFS')
			vfsCreateImpl = async () => {
				throw error
			}

			await expect(
				getRawSqliteDb({
					pullWasmBinary: mockPullWasmBinary,
					dbName: mockDbName
				})
			).rejects.toThrow(error)
		})

		test('throws error when database opening fails', async () => {
			const error = new Error('Failed to open database')
			mockOpenV2.mockRejectedValue(error)

			await expect(
				getRawSqliteDb({
					pullWasmBinary: mockPullWasmBinary,
					dbName: mockDbName
				})
			).rejects.toThrow(error)
		})

		test('throws error when VFS registration fails', async () => {
			const error = new Error('Failed to register VFS')
			mockVfsRegister.mockImplementation(() => {
				throw error
			})

			await expect(
				getRawSqliteDb({
					pullWasmBinary: mockPullWasmBinary,
					dbName: mockDbName
				})
			).rejects.toThrow(error)
		})
	})

	describe('integration flow', () => {
		test('executes all steps in correct order', async () => {
			// Track call order
			const callOrder: string[] = []

			createModuleImpl = async () => {
				callOrder.push('createModule')
				return mockModule
			}

			vfsCreateImpl = async () => {
				callOrder.push('vfsCreate')
				return mockVfs
			}

			mockFactory.mockImplementation((module) => {
				callOrder.push('factory')
				expect(module).toBe(mockModule)
				return mockSqlite3
			})

			mockVfsRegister.mockImplementation(() => {
				callOrder.push('vfsRegister')
			})

			mockOpenV2.mockImplementation(() => {
				callOrder.push('openDb')
				return Promise.resolve(mockDb)
			})

			await getRawSqliteDb({
				pullWasmBinary: mockPullWasmBinary,
				dbName: mockDbName
			})

			expect(callOrder).toEqual([
				'createModule',
				'factory',
				'vfsCreate',
				'vfsRegister',
				'openDb'
			])
		})

		test('handles different database names correctly', async () => {
			const customDbName = 'custom-database-name'

			await getRawSqliteDb({
				pullWasmBinary: mockPullWasmBinary,
				dbName: customDbName
			})

			expect(mockOpenV2).toHaveBeenCalledExactlyOnceWith(customDbName)
		})

		test('handles different pullWasmBinary functions correctly', async () => {
			const customWasmBinary = new ArrayBuffer(2048)
			const customPullWasmBinary = vi.fn().mockResolvedValue(customWasmBinary)

			await getRawSqliteDb({
				pullWasmBinary: customPullWasmBinary,
				dbName: mockDbName
			})

			expect(createModule).toHaveBeenCalledExactlyOnceWith(customPullWasmBinary)
		})
	})
})
