import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import {
	TransitionImpact,
	UpstreamWsMessageAction,
	type LocalDatabase,
	type UpstreamWsMessage
} from '@ground0/shared'
import type { Ingredients } from '../base'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createActor } from 'xstate'
import { OptimisticPushTransitionRunner } from './optimistic_push'
import SuperJSON from 'superjson'

const bareMinimumIngredients = {
	memoryModel: {},
	resources: {
		db: { status: DbResourceStatus.Disconnected },
		ws: { status: WsResourceStatus.Disconnected }
	},
	id: 3,
	actorRef: {},
	localHandler: {},
	transition: {
		action: 'transition4',
		impact: TransitionImpact.OptimisticPush
	}
} as Ingredients<Record<string, never>, TransitionImpact.OptimisticPush>

vi.mock('xstate', { spy: true })
afterEach(vi.clearAllMocks)

// This would normally ensure console.warn doesn't log anything, but it like,
// completely doesn't. I've given up on suppressing and testing logging
// entirely, but if you know what you're doing, a PR would be appreciated. At
// least the console spam can prove that it works instead, in the meantime.
//
// Hours wasted here so far: 1
//
// const _ = vi.spyOn(console, 'warn').mockImplementation(() => {})

test('constructor creates one instance of the machine, starts it, and inits it', () => {
	const ingredients: Ingredients<
		Record<string, never>,
		TransitionImpact.OptimisticPush
	> = {
		...bareMinimumIngredients
	}

	const startFn = vi.fn()
	const sendFn = vi.fn()
	const createActorFn = vi.mocked(createActor).mockImplementation(
		() =>
			({
				start: startFn,
				send: sendFn
			}) as unknown as ReturnType<typeof createActor>
	)

	const runner = new OptimisticPushTransitionRunner(ingredients)
	// @ts-expect-error We need to see the private stuff
	expect(createActorFn).toHaveBeenCalledExactlyOnceWith(runner.machine)
	expect(startFn).toHaveBeenCalledOnce()
	expect(sendFn).toHaveBeenCalledExactlyOnceWith({ type: 'init' })
	expect(startFn).toHaveBeenCalledAfter(createActorFn)
	expect(sendFn).toHaveBeenCalledAfter(startFn)

	createActorFn.mockReset()
})
describe('init', () => {
	test('no immediate errors', () => {
		expect(
			() =>
				new OptimisticPushTransitionRunner({
					...bareMinimumIngredients,
					localHandler: {
						editDb: () => {},
						revertDb: () => {}
					}
				})
		).not.toThrow()
	})
	describe('memory model', () => {
		test('becomes in progress if there is an editMemoryModel', () => {
			const editMemoryModel = vi
				.fn()
				.mockImplementation(() => new Promise(() => {}))
			const revertMemoryModel = vi
				.fn()
				.mockImplementation(() => new Promise(() => {}))

			const runner = new OptimisticPushTransitionRunner({
				...bareMinimumIngredients,
				localHandler: {
					editMemoryModel,
					revertMemoryModel
				}
			})
			// @ts-expect-error We need to see the private stuff
			const snapshot = runner.machineActorRef.getSnapshot()

			expect(snapshot.matches({ 'memory model': 'in progress' })).toBeTruthy()
			expect(editMemoryModel).toHaveBeenCalledOnce()
			expect(revertMemoryModel).not.toHaveBeenCalled()
		})
		test('becomes not required if there is no editMemoryModel', () => {
			const runner = new OptimisticPushTransitionRunner({
				...bareMinimumIngredients,
				localHandler: {
					editDb: () => {},
					revertDb: () => {}
				}
			})
			// @ts-expect-error We need to see the private stuff
			const snapshot = runner.machineActorRef.getSnapshot()

			expect(snapshot.matches({ 'memory model': 'not required' })).toBeTruthy()
		})
	})
	describe('db', () => {
		test('becomes in progress if there is an editDb and a connected db', () => {
			const editDb = vi.fn().mockImplementation(() => new Promise(() => {}))
			const revertDb = vi.fn().mockImplementation(() => new Promise(() => {}))

			const runner = new OptimisticPushTransitionRunner({
				...bareMinimumIngredients,
				resources: {
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					},
					ws: { status: WsResourceStatus.Disconnected }
				},
				localHandler: {
					editDb,
					revertDb
				}
			})
			// @ts-expect-error We need to see the private stuff
			const snapshot = runner.machineActorRef.getSnapshot()

			expect(snapshot.matches({ db: 'in progress' })).toBeTruthy()
			expect(editDb).toHaveBeenCalledOnce()
			expect(revertDb).not.toHaveBeenCalled()
		})
		test('becomes not possible if there is an editDb but the db will never connect', () => {
			const editDb = vi.fn().mockImplementation(() => new Promise(() => {}))
			const revertDb = vi.fn().mockImplementation(() => new Promise(() => {}))

			const runner = new OptimisticPushTransitionRunner({
				...bareMinimumIngredients,
				resources: {
					db: { status: DbResourceStatus.NeverConnecting },
					ws: { status: WsResourceStatus.Disconnected }
				},
				localHandler: {
					editDb,
					revertDb
				}
			})
			// @ts-expect-error We need to see the private stuff
			const snapshot = runner.machineActorRef.getSnapshot()

			expect(snapshot.matches({ db: 'not possible' })).toBeTruthy()
			expect(editDb).not.toHaveBeenCalled()
			expect(revertDb).not.toHaveBeenCalled()
		})
		test('becomes awaiting resources if there is an editDb but db is not available yet', () => {
			const editDb = vi.fn().mockImplementation(() => new Promise(() => {}))
			const revertDb = vi.fn().mockImplementation(() => new Promise(() => {}))

			const runner = new OptimisticPushTransitionRunner({
				...bareMinimumIngredients,
				localHandler: {
					editDb,
					revertDb
				}
			})
			// @ts-expect-error We need to see the private stuff
			const snapshot = runner.machineActorRef.getSnapshot()

			expect(snapshot.matches({ db: 'awaiting resources' })).toBeTruthy()
			expect(editDb).not.toHaveBeenCalled()
			expect(revertDb).not.toHaveBeenCalled()
		})
		describe('becomes not required if there is no editDb and db is', () => {
			test('not available yet', () => {
				const runner = new OptimisticPushTransitionRunner({
					...bareMinimumIngredients,
					localHandler: {
						editMemoryModel: () => {},
						revertMemoryModel: () => {}
					}
				})
				// @ts-expect-error We need to see the private stuff
				const snapshot = runner.machineActorRef.getSnapshot()

				expect(snapshot.matches({ db: 'not required' })).toBeTruthy()
			})
			test('never connecting', () => {
				const runner = new OptimisticPushTransitionRunner({
					...bareMinimumIngredients,
					resources: {
						db: { status: DbResourceStatus.NeverConnecting },
						ws: { status: WsResourceStatus.Disconnected }
					},
					localHandler: {
						editMemoryModel: () => {},
						revertMemoryModel: () => {}
					}
				})
				// @ts-expect-error We need to see the private stuff
				const snapshot = runner.machineActorRef.getSnapshot()

				expect(snapshot.matches({ db: 'not required' })).toBeTruthy()
			})
			test('connected', () => {
				const runner = new OptimisticPushTransitionRunner({
					...bareMinimumIngredients,
					resources: {
						db: {
							status: DbResourceStatus.ConnectedAndMigrated,
							instance: {} as LocalDatabase
						},
						ws: { status: WsResourceStatus.Disconnected }
					},
					localHandler: {
						editMemoryModel: () => {},
						revertMemoryModel: () => {}
					}
				})
				// @ts-expect-error We need to see the private stuff
				const snapshot = runner.machineActorRef.getSnapshot()

				expect(snapshot.matches({ db: 'not required' })).toBeTruthy()
			})
		})
	})
	test('ws message sent on init if available', () => {
		const send = vi.fn()
		const runner = new OptimisticPushTransitionRunner({
			...bareMinimumIngredients,
			resources: {
				db: { status: DbResourceStatus.Disconnected },
				ws: {
					status: WsResourceStatus.Connected,
					instance: { send } as unknown as WebSocket
				}
			},
			localHandler: {
				editMemoryModel: () => {},
				revertMemoryModel: () => {}
			}
		})
		// @ts-expect-error We need to see the private stuff
		const snapshot = runner.machineActorRef.getSnapshot()

		expect(snapshot.matches({ ws: 'no response' })).toBeTruthy()
		expect(send).toHaveBeenCalledExactlyOnceWith(
			SuperJSON.stringify({
				action: UpstreamWsMessageAction.Transition,
				id: bareMinimumIngredients.id,
				data: bareMinimumIngredients.transition
			} satisfies UpstreamWsMessage)
		)
	})
})
describe('no revert required', () => {
	type LocalHandlerConfig = 'memory-model' | 'db' | 'both'
	const setupTransitionTest = ({
		isAsync,
		isSuccess,
		localHandlerConfig
	}: {
		isAsync: boolean
		isSuccess: boolean
		localHandlerConfig: LocalHandlerConfig
	}) => {
		const send = vi.fn()

		const mockFn = (name: string) => {
			if (isAsync) {
				return vi.fn().mockImplementation(
					() =>
						new Promise((resolve, reject) => {
							setTimeout(
								() =>
									isSuccess
										? resolve(undefined)
										: reject(new Error(`${name} failed`)),
								300
							)
						})
				)
			}
			return vi.fn(() => {
				if (!isSuccess) {
					throw new Error(`${name} failed`)
				}
			})
		}

		const editMemoryModel = mockFn('editMemoryModel')
		const revertMemoryModel = vi.fn()
		const editDb = mockFn('editDb')
		const revertDb = vi.fn()

		const localHandler: Ingredients<any, any>['localHandler'] = {}
		const hasMemoryModel =
			localHandlerConfig === 'memory-model' || localHandlerConfig === 'both'
		const hasDb = localHandlerConfig === 'db' || localHandlerConfig === 'both'

		if (hasMemoryModel) {
			localHandler.editMemoryModel = editMemoryModel
			localHandler.revertMemoryModel = revertMemoryModel
		}
		if (hasDb) {
			localHandler.editDb = editDb
			localHandler.revertDb = revertDb
		}

		const runner = new OptimisticPushTransitionRunner({
			...bareMinimumIngredients,
			resources: {
				db: { status: DbResourceStatus.Disconnected },
				ws: {
					status: WsResourceStatus.Connected,
					instance: { send } as unknown as WebSocket
				}
			},
			localHandler
		})

		const markComplete = vi.fn()
		// @ts-expect-error We do this to know whether it's completed
		runner.markComplete = markComplete

		if (hasDb) {
			runner.syncResources({
				db: {
					status: DbResourceStatus.ConnectedAndMigrated,
					instance: {} as LocalDatabase
				}
			})
		}

		const checks = () => {
			expect(send).toHaveBeenCalledOnce()
			if (hasMemoryModel) {
				expect(editMemoryModel).toHaveBeenCalledOnce()
				expect(revertMemoryModel).not.toHaveBeenCalled()
			}
			if (hasDb) {
				expect(editDb).toHaveBeenCalledOnce()
				expect(revertDb).not.toHaveBeenCalled()
			}
		}

		const memoryModelState = hasMemoryModel
			? isSuccess
				? 'completed'
				: 'failed'
			: 'not required'
		const dbState = hasDb ? (isSuccess ? 'completed' : 'failed') : 'not required'

		return { runner, markComplete, checks, memoryModelState, dbState, isAsync }
	}

	const runTransitionTest = ({
		runner,
		markComplete,
		checks,
		memoryModelState,
		dbState,
		isAsync
	}: ReturnType<typeof setupTransitionTest>) => {
		if (isAsync) {
			return new Promise<void>(async (resolve, reject) => {
				try {
					checks()
					expect(markComplete).not.toHaveBeenCalled()
					await vi.waitUntil(
						() => {
							// @ts-expect-error We need to see the private stuff
							const snapshot = runner.machineActorRef.getSnapshot()
							return snapshot.matches({
								ws: 'no response',
								'memory model': memoryModelState,
								db: dbState
							})
						},
						{
							timeout: 1600,
							interval: 100
						}
					)
					expect(markComplete).not.toHaveBeenCalled()
					runner.reportWsResult(true)
					checks()
					{
						// @ts-expect-error We need to see the private stuff
						const snapshot = runner.machineActorRef.getSnapshot()
						expect(
							snapshot.matches({
								ws: 'confirmed',
								'memory model': memoryModelState,
								db: dbState
							})
						).toBeTruthy()
					}
					queueMicrotask(() => {
						try {
							expect(markComplete).toHaveBeenCalledOnce()
							resolve()
						} catch (e) {
							reject(e)
						}
					})
				} catch (e) {
					reject(e)
				}
			})
		} else {
			// sync
			return new Promise<void>((resolve, reject) =>
				setImmediate(() => {
					try {
						checks()
						expect(markComplete).not.toHaveBeenCalled()
						{
							// @ts-expect-error We need to see the private stuff
							const snapshot = runner.machineActorRef.getSnapshot()
							expect(
								snapshot.matches({
									ws: 'no response',
									'memory model': memoryModelState,
									db: dbState
								})
							).toBeTruthy()
						}
						runner.reportWsResult(true)
						checks()
						{
							// @ts-expect-error We need to see the private stuff
							const snapshot = runner.machineActorRef.getSnapshot()
							expect(
								snapshot.matches({
									ws: 'confirmed',
									'memory model': memoryModelState,
									db: dbState
								})
							).toBeTruthy()
						}
						queueMicrotask(() => {
							try {
								expect(markComplete).toHaveBeenCalledOnce()
								resolve()
							} catch (e) {
								reject(e)
							}
						})
					} catch (e) {
						reject(e)
					}
				})
			)
		}
	}

	const testConfigs: { name: string; config: { localHandlerConfig: LocalHandlerConfig } }[] = [
		{ name: 'memory model only', config: { localHandlerConfig: 'memory-model' } },
		{ name: 'db only', config: { localHandlerConfig: 'db' } },
		{ name: 'db and memory model', config: { localHandlerConfig: 'both' } }
	]

	;[true, false].forEach((isSuccess) => {
		describe(isSuccess ? 'happy execution path' : 'failure execution path', () => {
			;[false, true].forEach((isAsync) => {
				describe(isAsync ? 'async' : 'sync', () => {
					testConfigs.forEach(({ name, config }) => {
						test(name, () => {
							const testSetup = setupTransitionTest({
								isAsync,
								isSuccess,
								...config
							})
							return runTransitionTest(testSetup)
						})
					})
				})
			})
		})
	})
})
// describe('revert required', () => {})
