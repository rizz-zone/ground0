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

const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
beforeEach(() => consoleWarn.mockImplementation(() => {}))

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
		(extended ? 20 : 120) + Math.random() * 60
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

	// Do the main chunk of the test
	let calledTimes = 0
	await vi.waitUntil(
		() => {
			// @ts-expect-error We need to see the private stuff
			const snapshot = runner.machineActorRef.getSnapshot()
			if (calledTimes > 50 && calledTimes % 10 === 0)
				console.log(snapshot.value)
			calledTimes++
			return snapshot.matches({
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
		},
		{
			timeout: 1600,
			interval: 10
		}
	)
	return await new Promise<void>((resolve, reject) =>
		queueMicrotask(() => {
			try {
				expect(markComplete).toHaveBeenCalledOnce()
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

/*
describe('no revert required', () => {
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
							runChecks()
							expect(markComplete).not.toHaveBeenCalled()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
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
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'confirmed',
										'memory model': 'completed',
										db: 'not required'
									})
								).toBeTruthy()
							}
							queueMicrotask(() => {
								try {
									expect(markComplete).toHaveBeenCalledOnce()
								} catch (e) {
									return reject(e)
								}
								resolve()
							})
						} catch (e) {
							reject(e)
						}
					})
				)
			})
			test('db only', () => {
				const send = vi.fn()
				const editDb = vi.fn()
				const revertDb = vi.fn()
				const runner = new OptimisticPushTransitionRunner({
					...bareMinimumIngredients,
					resources: {
						db: {
							status: DbResourceStatus.Disconnected
						},
						ws: {
							status: WsResourceStatus.Connected,
							instance: { send } as unknown as WebSocket
						}
					},
					localHandler: {
						editDb,
						revertDb
					}
				})
				const markComplete = vi.fn()
				// @ts-expect-error We do this to know whether it's completed
				runner.markComplete = markComplete
				const runChecks = () => {
					expect(send).toHaveBeenCalledOnce()
					expect(editDb).toHaveBeenCalledOnce()
					expect(revertDb).not.toHaveBeenCalled()
				}
				runner.syncResources({
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					}
				})
				return new Promise<void>((resolve, reject) =>
					setImmediate(() => {
						try {
							runChecks()
							expect(markComplete).not.toHaveBeenCalled()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'no response',
										'memory model': 'not required',
										db: 'completed'
									})
								).toBeTruthy()
							}
							runner.reportWsResult(true)
							runChecks()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'confirmed',
										'memory model': 'not required',
										db: 'completed'
									})
								).toBeTruthy()
							}
							queueMicrotask(() => {
								try {
									expect(markComplete).toHaveBeenCalledOnce()
								} catch (e) {
									return reject(e)
								}
								resolve()
							})
						} catch (e) {
							reject(e)
						}
					})
				)
			})
			test('db and memory model', () => {
				const send = vi.fn()
				const editDb = vi.fn()
				const revertDb = vi.fn()
				const editMemoryModel = vi.fn()
				const revertMemoryModel = vi.fn()
				const runner = new OptimisticPushTransitionRunner({
					...bareMinimumIngredients,
					resources: {
						db: {
							status: DbResourceStatus.Disconnected
						},
						ws: {
							status: WsResourceStatus.Connected,
							instance: { send } as unknown as WebSocket
						}
					},
					localHandler: {
						editDb,
						revertDb,
						editMemoryModel,
						revertMemoryModel
					}
				})
				const markComplete = vi.fn()
				// @ts-expect-error We do this to know whether it's completed
				runner.markComplete = markComplete
				const runChecks = () => {
					expect(send).toHaveBeenCalledOnce()
					expect(editDb).toHaveBeenCalledOnce()
					expect(revertDb).not.toHaveBeenCalled()
					expect(editMemoryModel).toHaveBeenCalledOnce()
					expect(revertMemoryModel).not.toHaveBeenCalled()
				}
				runner.syncResources({
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					}
				})
				return new Promise<void>((resolve, reject) =>
					setImmediate(() => {
						try {
							runChecks()
							expect(markComplete).not.toHaveBeenCalled()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'no response',
										'memory model': 'completed',
										db: 'completed'
									})
								).toBeTruthy()
							}
							runner.reportWsResult(true)
							runChecks()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'confirmed',
										'memory model': 'completed',
										db: 'completed'
									})
								).toBeTruthy()
							}
							queueMicrotask(() => {
								try {
									expect(markComplete).toHaveBeenCalledOnce()
								} catch (e) {
									return reject(e)
								}
								resolve()
							})
						} catch (e) {
							reject(e)
						}
					})
				)
			})
		})
		describe('async', () => {
			test('memory model only', () => {
				const send = vi.fn()
				const editMemoryModel = vi
					.fn()
					.mockImplementation(
						() => new Promise((resolve) => setTimeout(resolve, 300))
					)
				const revertMemoryModel = vi
					.fn()
					.mockImplementation(
						() => new Promise((resolve) => setTimeout(resolve, 300))
					)
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
					setImmediate(async () => {
						try {
							runChecks()
							expect(markComplete).not.toHaveBeenCalled()
							await vi.waitUntil(
								() => {
									// @ts-expect-error We need to see the private stuff
									const snapshot = runner.machineActorRef.getSnapshot()
									return snapshot.matches({
										ws: 'no response',
										'memory model': 'completed',
										db: 'not required'
									})
								},
								{
									timeout: 1600,
									interval: 100
								}
							)
							expect(markComplete).not.toHaveBeenCalled()
							runner.reportWsResult(true)
							runChecks()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'confirmed',
										'memory model': 'completed',
										db: 'not required'
									})
								).toBeTruthy()
							}
							queueMicrotask(() => {
								try {
									expect(markComplete).toHaveBeenCalledOnce()
								} catch (e) {
									return reject(e)
								}
								resolve()
							})
						} catch (e) {
							reject(e)
						}
					})
				)
			})
			test('db only', () => {
				const send = vi.fn()
				const editDb = vi
					.fn()
					.mockImplementation(
						() => new Promise((resolve) => setTimeout(resolve, 300))
					)
				const revertDb = vi
					.fn()
					.mockImplementation(
						() => new Promise((resolve) => setTimeout(resolve, 300))
					)
				const runner = new OptimisticPushTransitionRunner({
					...bareMinimumIngredients,
					resources: {
						db: {
							status: DbResourceStatus.Disconnected
						},
						ws: {
							status: WsResourceStatus.Connected,
							instance: { send } as unknown as WebSocket
						}
					},
					localHandler: {
						editDb,
						revertDb
					}
				})
				const markComplete = vi.fn()
				// @ts-expect-error We do this to know whether it's completed
				runner.markComplete = markComplete
				const runChecks = () => {
					expect(send).toHaveBeenCalledOnce()
					expect(editDb).toHaveBeenCalledOnce()
					expect(revertDb).not.toHaveBeenCalled()
				}
				runner.syncResources({
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					}
				})
				return new Promise<void>((resolve, reject) =>
					setImmediate(async () => {
						try {
							runChecks()
							expect(markComplete).not.toHaveBeenCalled()
							await vi.waitUntil(
								() => {
									// @ts-expect-error We need to see the private stuff
									const snapshot = runner.machineActorRef.getSnapshot()
									return snapshot.matches({
										ws: 'no response',
										'memory model': 'not required',
										db: 'completed'
									})
								},
								{
									timeout: 1600,
									interval: 100
								}
							)
							expect(markComplete).not.toHaveBeenCalled()
							runner.reportWsResult(true)
							runChecks()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'confirmed',
										'memory model': 'not required',
										db: 'completed'
									})
								).toBeTruthy()
							}
							queueMicrotask(() => {
								try {
									expect(markComplete).toHaveBeenCalledOnce()
								} catch (e) {
									return reject(e)
								}
								resolve()
							})
						} catch (e) {
							reject(e)
						}
					})
				)
			})
			test('db and memory model', () => {
				const send = vi.fn()
				const editDb = vi
					.fn()
					.mockImplementation(
						() => new Promise((resolve) => setTimeout(resolve, 300))
					)
				const revertDb = vi
					.fn()
					.mockImplementation(
						() => new Promise((resolve) => setTimeout(resolve, 300))
					)
				const editMemoryModel = vi
					.fn()
					.mockImplementation(
						() => new Promise((resolve) => setTimeout(resolve, 300))
					)
				const revertMemoryModel = vi
					.fn()
					.mockImplementation(
						() => new Promise((resolve) => setTimeout(resolve, 300))
					)
				const runner = new OptimisticPushTransitionRunner({
					...bareMinimumIngredients,
					resources: {
						db: {
							status: DbResourceStatus.Disconnected
						},
						ws: {
							status: WsResourceStatus.Connected,
							instance: { send } as unknown as WebSocket
						}
					},
					localHandler: {
						editDb,
						revertDb,
						editMemoryModel,
						revertMemoryModel
					}
				})
				const markComplete = vi.fn()
				// @ts-expect-error We do this to know whether it's completed
				runner.markComplete = markComplete
				const runChecks = () => {
					expect(send).toHaveBeenCalledOnce()
					expect(editDb).toHaveBeenCalledOnce()
					expect(revertDb).not.toHaveBeenCalled()
					expect(editMemoryModel).toHaveBeenCalledOnce()
					expect(revertMemoryModel).not.toHaveBeenCalled()
				}
				runner.syncResources({
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					}
				})
				return new Promise<void>((resolve, reject) =>
					setImmediate(async () => {
						try {
							runChecks()
							expect(markComplete).not.toHaveBeenCalled()
							await vi.waitUntil(
								() => {
									// @ts-expect-error We need to see the private stuff
									const snapshot = runner.machineActorRef.getSnapshot()
									return snapshot.matches({
										ws: 'no response',
										'memory model': 'completed',
										db: 'completed'
									})
								},
								{
									timeout: 1600,
									interval: 100
								}
							)
							runner.reportWsResult(true)
							runChecks()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'confirmed',
										'memory model': 'completed',
										db: 'completed'
									})
								).toBeTruthy()
							}
							queueMicrotask(() => {
								try {
									expect(markComplete).toHaveBeenCalledOnce()
								} catch (e) {
									return reject(e)
								}
								resolve()
							})
						} catch (e) {
							reject(e)
						}
					})
				)
			})
		})
	})
	describe('failure execution path', () => {
		describe('sync', () => {
			test('memory model only', () => {
				const send = vi.fn()
				const editMemoryModel = vi.fn(() => {
					throw new Error('editMemoryModel failed')
				})
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
							runChecks()
							expect(markComplete).not.toHaveBeenCalled()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'no response',
										'memory model': 'failed',
										db: 'not required'
									})
								).toBeTruthy()
							}
							runner.reportWsResult(true)
							runChecks()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'confirmed',
										'memory model': 'failed',
										db: 'not required'
									})
								).toBeTruthy()
							}
							queueMicrotask(() => {
								try {
									expect(markComplete).toHaveBeenCalledOnce()
								} catch (e) {
									return reject(e)
								}
								resolve()
							})
						} catch (e) {
							reject(e)
						}
					})
				)
			})
			test('db only', () => {
				const send = vi.fn()
				const editDb = vi.fn(() => {
					throw new Error('editDb failed')
				})
				const revertDb = vi.fn()
				const runner = new OptimisticPushTransitionRunner({
					...bareMinimumIngredients,
					resources: {
						db: {
							status: DbResourceStatus.Disconnected
						},
						ws: {
							status: WsResourceStatus.Connected,
							instance: { send } as unknown as WebSocket
						}
					},
					localHandler: {
						editDb,
						revertDb
					}
				})
				const markComplete = vi.fn()
				// @ts-expect-error We do this to know whether it's completed
				runner.markComplete = markComplete
				const runChecks = () => {
					expect(send).toHaveBeenCalledOnce()
					expect(editDb).toHaveBeenCalledOnce()
					expect(revertDb).not.toHaveBeenCalled()
				}
				runner.syncResources({
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					}
				})
				return new Promise<void>((resolve, reject) =>
					setImmediate(() => {
						try {
							runChecks()
							expect(markComplete).not.toHaveBeenCalled()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'no response',
										'memory model': 'not required',
										db: 'failed'
									})
								).toBeTruthy()
							}
							runner.reportWsResult(true)
							runChecks()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'confirmed',
										'memory model': 'not required',
										db: 'failed'
									})
								).toBeTruthy()
							}
							queueMicrotask(() => {
								try {
									expect(markComplete).toHaveBeenCalledOnce()
								} catch (e) {
									return reject(e)
								}
								resolve()
							})
						} catch (e) {
							reject(e)
						}
					})
				)
			})
			test('db and memory model', () => {
				const send = vi.fn()
				const editDb = vi.fn(() => {
					throw new Error('editDb failed')
				})
				const revertDb = vi.fn()
				const editMemoryModel = vi.fn(() => {
					throw new Error('editMemoryModel failed')
				})
				const revertMemoryModel = vi.fn()
				const runner = new OptimisticPushTransitionRunner({
					...bareMinimumIngredients,
					resources: {
						db: {
							status: DbResourceStatus.Disconnected
						},
						ws: {
							status: WsResourceStatus.Connected,
							instance: { send } as unknown as WebSocket
						}
					},
					localHandler: {
						editDb,
						revertDb,
						editMemoryModel,
						revertMemoryModel
					}
				})
				const markComplete = vi.fn()
				// @ts-expect-error We do this to know whether it's completed
				runner.markComplete = markComplete
				const runChecks = () => {
					expect(send).toHaveBeenCalledOnce()
					expect(editDb).toHaveBeenCalledOnce()
					expect(revertDb).not.toHaveBeenCalled()
					expect(editMemoryModel).toHaveBeenCalledOnce()
					expect(revertMemoryModel).not.toHaveBeenCalled()
				}
				runner.syncResources({
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					}
				})
				return new Promise<void>((resolve, reject) =>
					setImmediate(() => {
						try {
							runChecks()
							expect(markComplete).not.toHaveBeenCalled()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'no response',
										'memory model': 'failed',
										db: 'failed'
									})
								).toBeTruthy()
							}
							runner.reportWsResult(true)
							runChecks()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'confirmed',
										'memory model': 'failed',
										db: 'failed'
									})
								).toBeTruthy()
							}
							queueMicrotask(() => {
								try {
									expect(markComplete).toHaveBeenCalledOnce()
								} catch (e) {
									return reject(e)
								}
								resolve()
							})
						} catch (e) {
							reject(e)
						}
					})
				)
			})
		})
		describe('async', () => {
			test('memory model only', () => {
				const send = vi.fn()
				const editMemoryModel = vi
					.fn()
					.mockImplementation(
						() => new Promise((_, reject) => setTimeout(() => reject(), 300))
					)
				const revertMemoryModel = vi
					.fn()
					.mockImplementation(() =>
						Promise.reject(new Error('revertMemoryModel should not be called'))
					)
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
					setImmediate(async () => {
						try {
							runChecks()
							expect(markComplete).not.toHaveBeenCalled()
							await vi.waitUntil(
								() => {
									// @ts-expect-error We need to see the private stuff
									const snapshot = runner.machineActorRef.getSnapshot()
									return snapshot.matches({
										ws: 'no response',
										'memory model': 'failed',
										db: 'not required'
									})
								},
								{
									timeout: 1600,
									interval: 100
								}
							)
							runner.reportWsResult(true)
							runChecks()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'confirmed',
										'memory model': 'failed',
										db: 'not required'
									})
								).toBeTruthy()
							}
							queueMicrotask(() => {
								try {
									expect(markComplete).toHaveBeenCalledOnce()
								} catch (e) {
									return reject(e)
								}
								resolve()
							})
						} catch (e) {
							reject(e)
						}
					})
				)
			})
			test('db only', () => {
				const send = vi.fn()
				const editDb = vi
					.fn()
					.mockImplementation(
						() => new Promise((_, reject) => setTimeout(() => reject(), 300))
					)
				const revertDb = vi
					.fn()
					.mockImplementation(() =>
						Promise.reject(new Error('revertDb should not be called'))
					)
				const runner = new OptimisticPushTransitionRunner({
					...bareMinimumIngredients,
					resources: {
						db: {
							status: DbResourceStatus.Disconnected
						},
						ws: {
							status: WsResourceStatus.Connected,
							instance: { send } as unknown as WebSocket
						}
					},
					localHandler: {
						editDb,
						revertDb
					}
				})
				const markComplete = vi.fn()
				// @ts-expect-error We do this to know whether it's completed
				runner.markComplete = markComplete
				const runChecks = () => {
					expect(send).toHaveBeenCalledOnce()
					expect(editDb).toHaveBeenCalledOnce()
					expect(revertDb).not.toHaveBeenCalled()
				}
				runner.syncResources({
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					}
				})
				return new Promise<void>((resolve, reject) =>
					setImmediate(async () => {
						try {
							runChecks()
							expect(markComplete).not.toHaveBeenCalled()
							await vi.waitUntil(
								() => {
									// @ts-expect-error We need to see the private stuff
									const snapshot = runner.machineActorRef.getSnapshot()
									return snapshot.matches({
										ws: 'no response',
										'memory model': 'not required',
										db: 'failed'
									})
								},
								{
									timeout: 1600,
									interval: 100
								}
							)
							runner.reportWsResult(true)
							runChecks()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'confirmed',
										'memory model': 'not required',
										db: 'failed'
									})
								).toBeTruthy()
							}
							queueMicrotask(() => {
								try {
									expect(markComplete).toHaveBeenCalledOnce()
								} catch (e) {
									return reject(e)
								}
								resolve()
							})
						} catch (e) {
							reject(e)
						}
					})
				)
			})
			test('db and memory model', () => {
				const send = vi.fn()
				const editDb = vi
					.fn()
					.mockImplementation(
						() => new Promise((_, reject) => setTimeout(() => reject(), 300))
					)
				const revertDb = vi
					.fn()
					.mockImplementation(() =>
						Promise.reject(new Error('revertDb should not be called'))
					)
				const editMemoryModel = vi
					.fn()
					.mockImplementation(
						() => new Promise((_, reject) => setTimeout(() => reject(), 500))
					)
				const revertMemoryModel = vi
					.fn()
					.mockImplementation(() =>
						Promise.reject(new Error('revertMemoryModel should not be called'))
					)
				const runner = new OptimisticPushTransitionRunner({
					...bareMinimumIngredients,
					resources: {
						db: {
							status: DbResourceStatus.Disconnected
						},
						ws: {
							status: WsResourceStatus.Connected,
							instance: { send } as unknown as WebSocket
						}
					},
					localHandler: {
						editDb,
						revertDb,
						editMemoryModel,
						revertMemoryModel
					}
				})
				const markComplete = vi.fn()
				// @ts-expect-error We do this to know whether it's completed
				runner.markComplete = markComplete
				const runChecks = () => {
					expect(send).toHaveBeenCalledOnce()
					expect(editDb).toHaveBeenCalledOnce()
					expect(revertDb).not.toHaveBeenCalled()
					expect(editMemoryModel).toHaveBeenCalledOnce()
					expect(revertMemoryModel).not.toHaveBeenCalled()
				}
				runner.syncResources({
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					}
				})
				return new Promise<void>((resolve, reject) =>
					setImmediate(async () => {
						try {
							runChecks()
							expect(markComplete).not.toHaveBeenCalled()
							await vi.waitUntil(
								() => {
									// @ts-expect-error We need to see the private stuff
									const snapshot = runner.machineActorRef.getSnapshot()
									return snapshot.matches({
										ws: 'no response',
										'memory model': 'failed',
										db: 'failed'
									})
								},
								{
									timeout: 1600,
									interval: 100
								}
							)
							runner.reportWsResult(true)
							runChecks()
							{
								// @ts-expect-error We need to see the private stuff
								const snapshot = runner.machineActorRef.getSnapshot()
								expect(
									snapshot.matches({
										ws: 'confirmed',
										'memory model': 'failed',
										db: 'failed'
									})
								).toBeTruthy()
							}
							queueMicrotask(() => {
								try {
									expect(markComplete).toHaveBeenCalledOnce()
								} catch (e) {
									return reject(e)
								}
								resolve()
							})
						} catch (e) {
							reject(e)
						}
					})
				)
			})
		})
	})
})
// describe('revert required', () => {})
*/
