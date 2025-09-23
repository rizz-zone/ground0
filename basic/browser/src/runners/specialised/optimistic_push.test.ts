import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import {
	TransitionImpact,
	UpstreamWsMessageAction,
	type LocalDatabase,
	type UpstreamWsMessage
} from '@ground0/shared'
import type { Ingredients } from '../base'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createActor } from 'xstate'
import { OptimisticPushTransitionRunner } from './optimistic_push'
import SuperJSON from 'superjson'
import type { ResourceBundle } from '@/types/status/ResourceBundle'

const bareMinimumIngredients = {
	memoryModel: {},
	resources: {
		db: { status: DbResourceStatus.Disconnected },
		ws: { status: WsResourceStatus.Disconnected }
	},
	id: 3,
	markComplete: {},
	localHandler: {},
	transition: {
		action: 'transition4',
		impact: TransitionImpact.OptimisticPush
	}
} as Ingredients<Record<string, never>, TransitionImpact.OptimisticPush>

vi.mock('xstate', { spy: true })
afterEach(vi.clearAllMocks)

const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
beforeEach(() => consoleWarn.mockImplementation(() => {}))
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

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
const enum IncludedHandlerFunctions {
	MemoryModelOnly,
	DbOnly,
	Both
}
async function runExecutionTest({
	revertRequired,
	handlersSucceed,
	async,
	status,
	testing
}: {
	revertRequired: boolean
	handlersSucceed: boolean
	async: boolean
	status: {
		ws: WsResourceStatus
		db:
			| {
					initial:
						| DbResourceStatus.ConnectedAndMigrated
						| DbResourceStatus.NeverConnecting
			  }
			| {
					initial: DbResourceStatus.Disconnected
					convertTo:
						| DbResourceStatus.ConnectedAndMigrated
						| DbResourceStatus.NeverConnecting
			  }
	}
	testing: IncludedHandlerFunctions
}) {
	const someTimeout = (extended: boolean) =>
		(extended ? 120 : 20) + Math.random() * 60
	const standardHandler = async
		? () =>
				new Promise<void>((resolve, reject) =>
					setTimeout(
						() => (handlersSucceed ? resolve : reject)(),
						someTimeout(false)
					)
				)
		: () => {
				if (!handlersSucceed) throw new Error()
			}
	const wsSend = vi.fn()
	const [editMemoryModel, revertMemoryModel, editDb, revertDb] = Array.from(
		{ length: 4 },
		() => vi.fn().mockImplementation(standardHandler)
	) as [
		ReturnType<typeof vi.fn>,
		ReturnType<typeof vi.fn>,
		ReturnType<typeof vi.fn>,
		ReturnType<typeof vi.fn>
	]
	const runner = new OptimisticPushTransitionRunner({
		...bareMinimumIngredients,
		resources: {
			db: {
				status: status.db.initial,
				instance:
					status.db.initial === DbResourceStatus.ConnectedAndMigrated
						? ({} as LocalDatabase)
						: undefined
			},
			ws: {
				status: status.ws,
				instance:
					status.ws === WsResourceStatus.Connected
						? ({ send: wsSend } as unknown as WebSocket)
						: undefined
			}
		},
		localHandler: {
			...([
				IncludedHandlerFunctions.Both,
				IncludedHandlerFunctions.DbOnly
			].includes(testing)
				? {
						editDb,
						revertDb
					}
				: {}),
			...([
				IncludedHandlerFunctions.Both,
				IncludedHandlerFunctions.MemoryModelOnly
			].includes(testing)
				? {
						editMemoryModel,
						revertMemoryModel
					}
				: {})
		}
	} as Ingredients<Record<string, never>, TransitionImpact.OptimisticPush>)
	const markComplete = vi.fn()
	// @ts-expect-error We do this to know whether it's completed
	runner.markComplete = markComplete

	let sent = false
	const sendAction = () =>
		setTimeout(() => {
			if (sent) return
			runner.reportWsResult(!revertRequired)
			sent = true
		}, someTimeout(true))
	wsSend.mockImplementation(sendAction)
	if (status.ws === WsResourceStatus.Connected) sendAction()

	if (status.ws === WsResourceStatus.Disconnected)
		setTimeout(
			() =>
				runner.syncResources({
					ws: {
						status: WsResourceStatus.Connected,
						instance: { send: wsSend } as unknown as WebSocket
					}
				}),
			someTimeout(false)
		)
	if (status.db.initial === DbResourceStatus.Disconnected)
		setTimeout(() => {
			if (status.db.initial !== DbResourceStatus.Disconnected)
				throw new Error('somehow status.db.initial changed during the timeout')
			runner.syncResources({
				db: {
					status: status.db.convertTo,
					instance:
						status.db.convertTo === DbResourceStatus.ConnectedAndMigrated
							? ({} as LocalDatabase)
							: undefined
				} as ResourceBundle['db']
			})
		}, someTimeout(false))

	// Do the main chunk of the test without real waiting
	await vi.runAllTimersAsync()
	// @ts-expect-error We need to see the private stuff
	const snapshot = runner.machineActorRef.getSnapshot()
	expect(
		snapshot.matches({
			ws: revertRequired ? 'rejected' : 'confirmed',
			'memory model': [
				IncludedHandlerFunctions.Both,
				IncludedHandlerFunctions.MemoryModelOnly
			].includes(testing)
				? handlersSucceed
					? revertRequired
						? 'reverted'
						: 'completed'
					: 'failed'
				: 'not required',
			db: [
				IncludedHandlerFunctions.Both,
				IncludedHandlerFunctions.DbOnly
			].includes(testing)
				? status.db.initial === DbResourceStatus.NeverConnecting ||
					(status.db.initial === DbResourceStatus.Disconnected &&
						status.db.convertTo === DbResourceStatus.NeverConnecting)
					? 'not possible'
					: handlersSucceed
						? revertRequired
							? 'reverted'
							: 'completed'
						: 'failed'
				: 'not required'
		})
	).toBeTruthy()
	return await new Promise<void>((resolve, reject) =>
		queueMicrotask(() => {
			try {
				expect(markComplete).toHaveBeenCalled()
			} catch (e) {
				return reject(e)
			}
			resolve()
		})
	)
}

describe('execution', () => {
	for (const async of [true, false]) {
		describe(async ? 'async' : 'sync', () => {
			for (const handlersSucceed of [true, false]) {
				describe(handlersSucceed ? 'no errors' : 'handler errors', () => {
					for (const revertRequired of [true, false]) {
						describe(revertRequired ? 'ws rejects' : 'ws confirms', () => {
							for (const testing of [
								IncludedHandlerFunctions.MemoryModelOnly,
								IncludedHandlerFunctions.DbOnly,
								IncludedHandlerFunctions.Both
							]) {
								describe(
									testing === IncludedHandlerFunctions.MemoryModelOnly
										? 'memory model only'
										: testing === IncludedHandlerFunctions.DbOnly
											? 'db only'
											: 'both handlers' + ' required',
									() => {
										for (const ws of [
											WsResourceStatus.Connected,
											WsResourceStatus.Disconnected
										]) {
											describe(`ws ${ws === WsResourceStatus.Connected ? 'connected' : 'initially disconnected'}`, () => {
												for (const db of [
													{ initial: DbResourceStatus.ConnectedAndMigrated },
													{ initial: DbResourceStatus.NeverConnecting },
													{
														initial: DbResourceStatus.Disconnected,
														convertTo: DbResourceStatus.ConnectedAndMigrated
													},
													{
														initial: DbResourceStatus.Disconnected,
														convertTo: DbResourceStatus.NeverConnecting
													}
												] as (
													| {
															initial:
																| DbResourceStatus.ConnectedAndMigrated
																| DbResourceStatus.NeverConnecting
													  }
													| {
															initial: DbResourceStatus.Disconnected
															convertTo:
																| DbResourceStatus.ConnectedAndMigrated
																| DbResourceStatus.NeverConnecting
													  }
												)[]) {
													const testFn = () =>
														runExecutionTest({
															async,
															handlersSucceed,
															revertRequired,
															testing,
															status: {
																ws,
																db
															}
														})
													if (db.initial === DbResourceStatus.Disconnected)
														describe(`db initially disconnected`, () => {
															test(
																`becomes ${db.convertTo === DbResourceStatus.ConnectedAndMigrated ? 'connected' : 'never connecting'}`,
																testFn
															)
														})
													else
														test(
															`db ${db.initial === DbResourceStatus.ConnectedAndMigrated ? 'connected' : 'never connecting'}`,
															testFn
														)
												}
											})
										}
									}
								)
							}
						})
					}
				})
			}
		})
	}
})

// TODO: Test `did not begin executing before rejection` situations. or just
// one really because otherwise we risk doubling the tests created by the loop
// above, and some might already consider a ~39 second test to be Egregious
