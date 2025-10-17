import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { LocalOnlyTransitionRunner } from './local_only'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { TransitionImpact, type LocalDatabase } from '@ground0/shared'

afterEach(vi.clearAllMocks)

const baseResources = {
	db: { status: DbResourceStatus.Disconnected } as const,
	ws: { status: WsResourceStatus.Disconnected } as const
}

describe('LocalOnlyTransitionRunner', () => {
	const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
	beforeEach(() => consoleWarn.mockImplementation(() => {}))

	describe('constructor behavior', () => {
		test('runs memory model handler and completes (sync)', () => {
			const editMemoryModel = vi.fn()
			const markComplete = vi.fn()
			new LocalOnlyTransitionRunner({
				memoryModel: {},
				resources: { ...baseResources },
				id: 3,
				transition: {
					action: 'transition4',
					impact: TransitionImpact.LocalOnly
				},
				markComplete,
				localHandler: { editMemoryModel }
			})
			expect(editMemoryModel).toHaveBeenCalledOnce()
			return new Promise<void>((resolve, reject) =>
				queueMicrotask(() => {
					try {
						expect(markComplete).toHaveBeenCalledOnce()
						expect(consoleWarn).not.toHaveBeenCalled()
						resolve()
					} catch (e) {
						reject(e)
					}
				})
			)
		})

		test('memory model handler failure warns and still completes', () => {
			const editMemoryModel = vi.fn().mockImplementation(() => {
				throw new Error('boom')
			})
			const markComplete = vi.fn()
			new LocalOnlyTransitionRunner({
				memoryModel: {},
				resources: { ...baseResources },
				id: 3,
				transition: {
					action: 'transition4',
					impact: TransitionImpact.LocalOnly
				},
				markComplete,
				localHandler: { editMemoryModel }
			})
			return new Promise<void>((resolve, reject) =>
				queueMicrotask(() => {
					try {
						expect(consoleWarn).toHaveBeenCalled()
						expect(markComplete).toHaveBeenCalledOnce()
						resolve()
					} catch (e) {
						reject(e)
					}
				})
			)
		})

		test('runs db handler immediately when db is connected', () => {
			const editDb = vi.fn()
			const markComplete = vi.fn()
			new LocalOnlyTransitionRunner({
				memoryModel: {},
				resources: {
					ws: { status: WsResourceStatus.Disconnected },
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					}
				},
				id: 3,
				transition: {
					action: 'transition4',
					impact: TransitionImpact.LocalOnly
				},
				markComplete,
				localHandler: { editDb }
			})
			expect(editDb).toHaveBeenCalledOnce()
			return new Promise<void>((resolve, reject) =>
				queueMicrotask(() => {
					try {
						expect(markComplete).toHaveBeenCalledOnce()
						resolve()
					} catch (e) {
						reject(e)
					}
				})
			)
		})

		test('db initially NeverConnecting completes without handlers', () => {
			const markComplete = vi.fn()
			new LocalOnlyTransitionRunner({
				memoryModel: {},
				resources: {
					ws: { status: WsResourceStatus.Disconnected },
					db: { status: DbResourceStatus.NeverConnecting }
				},
				id: 7,
				transition: {
					action: 'transition4',
					impact: TransitionImpact.LocalOnly
				},
				markComplete,
				// @ts-expect-error We don't want the handlers getting in the
				// way in this test
				localHandler: {}
			})
			return new Promise<void>((resolve, reject) =>
				queueMicrotask(() => {
					try {
						expect(markComplete).toHaveBeenCalledOnce()
						resolve()
					} catch (e) {
						reject(e)
					}
				})
			)
		})

		test('db connected initially but no editDb: does nothing', () => {
			const markComplete = vi.fn()
			new LocalOnlyTransitionRunner({
				memoryModel: {},
				resources: {
					ws: { status: WsResourceStatus.Disconnected },
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					}
				},
				id: 8,
				transition: {
					action: 'transition4',
					impact: TransitionImpact.LocalOnly
				},
				markComplete,
				// @ts-expect-error We don't want the handlers getting in the
				// way in this test
				localHandler: {}
			})
			expect(markComplete).not.toHaveBeenCalled()
		})

		test('db handler failure warns and still completes', () => {
			const editDb = vi.fn().mockImplementation(() => {
				throw new Error('boom')
			})
			const markComplete = vi.fn()
			new LocalOnlyTransitionRunner({
				memoryModel: {},
				resources: {
					ws: { status: WsResourceStatus.Disconnected },
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					}
				},
				id: 3,
				transition: {
					action: 'transition4',
					impact: TransitionImpact.LocalOnly
				},
				markComplete,
				localHandler: { editDb }
			})
			return new Promise<void>((resolve, reject) =>
				queueMicrotask(() => {
					try {
						expect(consoleWarn).toHaveBeenCalled()
						expect(markComplete).toHaveBeenCalledOnce()
						resolve()
					} catch (e) {
						reject(e)
					}
				})
			)
		})

		test('with both handlers, completes only after both done', () => {
			const editMemoryModel = vi.fn()
			const editDb = vi.fn()
			const markComplete = vi.fn()
			new LocalOnlyTransitionRunner({
				memoryModel: {},
				resources: {
					ws: { status: WsResourceStatus.Disconnected },
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					}
				},
				id: 3,
				transition: {
					action: 'transition4',
					impact: TransitionImpact.LocalOnly
				},
				markComplete,
				localHandler: { editMemoryModel, editDb }
			})
			expect(editMemoryModel).toHaveBeenCalledOnce()
			expect(editDb).toHaveBeenCalledOnce()
			return new Promise<void>((resolve, reject) =>
				queueMicrotask(() => {
					try {
						expect(markComplete).toHaveBeenCalledOnce()
						resolve()
					} catch (e) {
						reject(e)
					}
				})
			)
		})
	})

	describe('resource updates', () => {
		test('db connects later: triggers db handler and completes', () => {
			const editDb = vi.fn()
			const markComplete = vi.fn()
			const runner = new LocalOnlyTransitionRunner({
				memoryModel: {},
				resources: { ...baseResources },
				id: 3,
				transition: {
					action: 'transition4',
					impact: TransitionImpact.LocalOnly
				},
				markComplete,
				localHandler: { editDb }
			})
			expect(editDb).not.toHaveBeenCalled()
			runner.syncResources({
				db: {
					status: DbResourceStatus.ConnectedAndMigrated,
					instance: {} as LocalDatabase
				}
			})
			expect(editDb).toHaveBeenCalledOnce()
			return new Promise<void>((resolve, reject) =>
				queueMicrotask(() => {
					try {
						expect(markComplete).toHaveBeenCalledOnce()
						resolve()
					} catch (e) {
						reject(e)
					}
				})
			)
		})

		test('db never connects: completes when marked NeverConnecting', () => {
			const editDb = vi.fn()
			const markComplete = vi.fn()
			const runner = new LocalOnlyTransitionRunner({
				memoryModel: {},
				resources: { ...baseResources },
				id: 3,
				transition: {
					action: 'transition4',
					impact: TransitionImpact.LocalOnly
				},
				markComplete,
				localHandler: { editDb }
			})
			runner.syncResources({ db: { status: DbResourceStatus.NeverConnecting } })
			return new Promise<void>((resolve, reject) =>
				queueMicrotask(() => {
					try {
						expect(editDb).not.toHaveBeenCalled()
						expect(markComplete).toHaveBeenCalledOnce()
						resolve()
					} catch (e) {
						reject(e)
					}
				})
			)
		})

		test('ws connects: no effect', () => {
			const editDb = vi.fn().mockImplementation(() => new Promise(() => {}))
			const editMemoryModel = vi
				.fn()
				.mockImplementation(() => new Promise(() => {}))
			const runner = new LocalOnlyTransitionRunner({
				memoryModel: {},
				resources: { ...baseResources },
				id: 3,
				transition: {
					action: 'transition4',
					impact: TransitionImpact.LocalOnly
				},
				markComplete: vi.fn(),
				localHandler: { editDb, editMemoryModel }
			})
			runner.syncResources({
				ws: {
					status: WsResourceStatus.Connected,
					instance: {} as unknown as WebSocket
				}
			})
			expect(editDb).not.toHaveBeenCalled()
			expect(editMemoryModel).toHaveBeenCalledOnce()
		})
	})
})
