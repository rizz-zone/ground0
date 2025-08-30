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
describe('happy execution path', () => {
	describe('sync', () => {
		test('memory model only', () => {
			const send = vi.fn()
			const editMemoryModel = vi.fn()
			const revertMemoryModel = vi.fn()
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
					editMemoryModel,
					revertMemoryModel
				}
			})
			const markComplete = vi.fn()
			// @ts-expect-error We do this to know whether it's completed
			runner.markComplete = markComplete
			const runChecks = () => {
				expect(send).toHaveBeenCalledOnce()
				expect(editMemoryModel).toHaveBeenCalledOnce()
				expect(revertMemoryModel).not.toHaveBeenCalled()
			}
			return new Promise<void>((resolve, reject) =>
				setImmediate(() => {
					try {
						console.log('being immediate...')
						runChecks()
						expect(markComplete).not.toHaveBeenCalled()
						{
							// @ts-expect-error We need to see the private stuff
							const snapshot = runner.machineActorRef.getSnapshot()
							console.log(snapshot.value)
							expect(
								snapshot.matches({
									ws: 'no response',
									'memory model': 'completed',
									db: 'not required'
								})
							).toBeTruthy()
						}
						runner.reportWsResult(true)
						runChecks()
						expect(markComplete).toHaveBeenCalledOnce()
						{
							// @ts-expect-error We need to see the private stuff
							const snapshot = runner.machineActorRef.getSnapshot()
							console.log(snapshot.value)
							expect(
								snapshot.matches({
									ws: 'confirmed',
									'memory model': 'completed',
									db: 'not required'
								})
							).toBeTruthy()
						}
						resolve()
					} catch (e) {
						reject(e)
					}
				})
			)
		})
	})
})
