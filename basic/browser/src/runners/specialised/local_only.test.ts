import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalOnlyTransitionRunner } from './local_only'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { TransitionImpact } from '@ground0/shared'
import type { SomeActorRef } from '@/types/SomeActorRef'
import type { Transformation } from '@/types/memory_model/Tranformation'
import { TransformationAction } from '@/types/memory_model/TransformationAction'
import type { LocalDatabase } from '../../../../shared/dist/types/LocalDatabase'

// const announceComplete = vi.fn()
// const announceTransformation = vi.fn()
const actorRefSend = vi.fn()
const actorRef = { send: actorRefSend } as unknown as SomeActorRef
afterEach(vi.clearAllMocks)

describe('constructor', () => {
	describe('sync', () => {
		it('immediately completes with memory model only', () => {
			const editMemoryModel = vi.fn().mockImplementation((data) => {
				data.memoryModel.tom = 'plus'
			})
			new LocalOnlyTransitionRunner({
				initialResources: {},
				memoryModel: {
					tom: 'normal'
				},
				resourceStatus: {
					ws: WsResourceStatus.Disconnected,
					db: DbResourceStatus.Disconnected
				},
				id: 0,
				transition: {
					action: 0,
					impact: TransitionImpact.LocalOnly
				},
				actorRef,
				localHandler: {
					editMemoryModel
				}
			})
			expect(editMemoryModel).toHaveBeenCalledOnce()
			expect(actorRefSend).toHaveBeenCalledAfter(editMemoryModel)
			expect(actorRefSend).toHaveBeenCalledTimes(2)
			expect(actorRefSend.mock.calls[0]?.[0]).toMatchObject({
				type: 'announce transformation',
				transformation: {
					action: TransformationAction.Set,
					path: ['tom'],
					newValue: 'plus'
				} satisfies Transformation
			})
			expect(actorRefSend.mock.calls[1]?.[0]).toMatchObject({
				type: 'transition complete',
				id: 0
			})
		})
		describe('db handler', () => {
			const editDb = vi.fn()
			const editMemoryModel = vi.fn()
			const db = {} as LocalDatabase
			describe('when marked disconnected', () => {
				it('does not run alone', () => {
					new LocalOnlyTransitionRunner({
						initialResources: {},
						memoryModel: {
							tom: 'normal'
						},
						resourceStatus: {
							ws: WsResourceStatus.Disconnected,
							db: DbResourceStatus.Disconnected
						},
						id: 0,
						transition: {
							action: 0,
							impact: TransitionImpact.LocalOnly
						},
						actorRef,
						localHandler: {
							editDb
						}
					})
					expect(editDb).not.toHaveBeenCalled()
					expect(actorRefSend).not.toHaveBeenCalled()
				})
				it('does not run with memory model handler', () => {
					new LocalOnlyTransitionRunner({
						initialResources: {},
						memoryModel: {
							tom: 'normal'
						},
						resourceStatus: {
							ws: WsResourceStatus.Disconnected,
							db: DbResourceStatus.Disconnected
						},
						id: 0,
						transition: {
							action: 0,
							impact: TransitionImpact.LocalOnly
						},
						actorRef,
						localHandler: {
							editDb,
							editMemoryModel
						}
					})
					expect(editDb).not.toHaveBeenCalled()
					expect(editMemoryModel).toHaveBeenCalledOnce()
					expect(actorRefSend).not.toHaveBeenCalled()
				})
			})
			describe('when marked connected', () => {
				it('runs alone', () => {
					new LocalOnlyTransitionRunner({
						initialResources: {
							db
						},
						memoryModel: {
							tom: 'normal'
						},
						resourceStatus: {
							ws: WsResourceStatus.Disconnected,
							db: DbResourceStatus.ConnectedAndMigrated
						},
						id: 0,
						transition: {
							action: 0,
							impact: TransitionImpact.LocalOnly
						},
						actorRef,
						localHandler: {
							editDb
						}
					})
					expect(editDb).toHaveBeenCalledOnce()
					expect(actorRefSend).toHaveBeenCalledExactlyOnceWith({
						type: 'transition complete',
						id: 0
					})
				})
				it('runs with memory model handler', () => {
					new LocalOnlyTransitionRunner({
						initialResources: {
							db
						},
						memoryModel: {
							tom: 'normal'
						},
						resourceStatus: {
							ws: WsResourceStatus.Disconnected,
							db: DbResourceStatus.ConnectedAndMigrated
						},
						id: 0,
						transition: {
							action: 0,
							impact: TransitionImpact.LocalOnly
						},
						actorRef,
						localHandler: {
							editDb,
							editMemoryModel
						}
					})
					expect(editDb).toHaveBeenCalledOnce()
					expect(editMemoryModel).toHaveBeenCalledOnce()
					expect(actorRefSend).toHaveBeenCalledExactlyOnceWith({
						type: 'transition complete',
						id: 0
					})
				})
			})
		})
	})
	describe('async', () => {
		it('completes as soon as possible with memory model only', () => {
			const editMemoryModel = vi.fn().mockImplementation(
				(data) =>
					new Promise<void>((resolve) =>
						setTimeout(() => {
							data.memoryModel.tom = 'plus'
							resolve()
						}, 0)
					)
			)
			new LocalOnlyTransitionRunner({
				initialResources: {},
				memoryModel: {
					tom: 'normal'
				},
				resourceStatus: {
					ws: WsResourceStatus.Disconnected,
					db: DbResourceStatus.Disconnected
				},
				id: 0,
				transition: {
					action: 0,
					impact: TransitionImpact.LocalOnly
				},
				actorRef,
				localHandler: {
					editMemoryModel
				}
			})
			expect(editMemoryModel).toHaveBeenCalledOnce()
			expect(actorRefSend).not.toHaveBeenCalled()

			return new Promise<void>((resolve) =>
				setTimeout(() => {
					expect(actorRefSend).toHaveBeenCalledAfter(editMemoryModel)
					expect(actorRefSend).toHaveBeenCalledTimes(2)
					expect(actorRefSend.mock.calls[0]?.[0]).toMatchObject({
						type: 'announce transformation',
						transformation: {
							action: TransformationAction.Set,
							path: ['tom'],
							newValue: 'plus'
						} satisfies Transformation
					})
					expect(actorRefSend.mock.calls[1]?.[0]).toMatchObject({
						type: 'transition complete',
						id: 0
					})

					resolve()
				}, 0)
			)
		})
		describe('db handler', () => {
			const baseFunction = () =>
				new Promise((resolve) => setTimeout(resolve, 0))
			const editDb = vi.fn().mockImplementation(baseFunction)
			const db = {} as LocalDatabase
			it('runs while alone', () => {
				new LocalOnlyTransitionRunner({
					initialResources: {
						db
					},
					memoryModel: {
						tom: 'normal'
					},
					resourceStatus: {
						ws: WsResourceStatus.Disconnected,
						db: DbResourceStatus.ConnectedAndMigrated
					},
					id: 0,
					transition: {
						action: 0,
						impact: TransitionImpact.LocalOnly
					},
					actorRef,
					localHandler: {
						editDb
					}
				})
				expect(editDb).toHaveBeenCalledOnce()
				expect(actorRefSend).not.toHaveBeenCalled()
				return new Promise<void>((resolve) =>
					setTimeout(() => {
						expect(actorRefSend).toHaveBeenCalledExactlyOnceWith({
							type: 'transition complete',
							id: 0
						})
						resolve()
					}, 0)
				)
			})
			it('runs alongside memory model handler', () => {
				const editMemoryModel = vi.fn().mockImplementation(baseFunction)
				new LocalOnlyTransitionRunner({
					initialResources: {
						db
					},
					memoryModel: {
						tom: 'normal'
					},
					resourceStatus: {
						ws: WsResourceStatus.Disconnected,
						db: DbResourceStatus.ConnectedAndMigrated
					},
					id: 0,
					transition: {
						action: 0,
						impact: TransitionImpact.LocalOnly
					},
					actorRef,
					localHandler: {
						editDb,
						editMemoryModel
					}
				})
				expect(editDb).toHaveBeenCalledOnce()
				expect(editMemoryModel).toHaveBeenCalledOnce()
				expect(actorRefSend).not.toHaveBeenCalled()
				return new Promise<void>((resolve) =>
					setTimeout(() => {
						expect(actorRefSend).toHaveBeenCalledExactlyOnceWith({
							type: 'transition complete',
							id: 0
						})
						resolve()
					}, 0)
				)
			})
		})
	})
})
describe('db connection events', () => {
	describe('on connect', () => {
		it('calls the handler once ready alone', () => {
			const editDb = vi.fn()
			const runner = new LocalOnlyTransitionRunner({
				initialResources: {},
				memoryModel: {
					tom: 'normal'
				},
				resourceStatus: {
					ws: WsResourceStatus.Disconnected,
					db: DbResourceStatus.Disconnected
				},
				id: 0,
				transition: {
					action: 0,
					impact: TransitionImpact.LocalOnly
				},
				actorRef,
				localHandler: {
					editDb
				}
			})
			expect(editDb).not.toHaveBeenCalled()
			expect(actorRefSend).not.toHaveBeenCalled()

			runner.syncResources(
				{
					db: {} as LocalDatabase
				},
				{
					ws: WsResourceStatus.Disconnected,
					db: DbResourceStatus.ConnectedAndMigrated
				}
			)

			expect(editDb).toHaveBeenCalledOnce()
			expect(actorRefSend).toHaveBeenCalledExactlyOnceWith({
				type: 'transition complete',
				id: 0
			})
			expect(actorRefSend).toHaveBeenCalledAfter(editDb)
		})
		it('calls the handler once ready, after memory model handler', () => {
			const editDb = vi.fn()
			const editMemoryModel = vi.fn()
			const runner = new LocalOnlyTransitionRunner({
				initialResources: {},
				memoryModel: {
					tom: 'normal'
				},
				resourceStatus: {
					ws: WsResourceStatus.Disconnected,
					db: DbResourceStatus.Disconnected
				},
				id: 0,
				transition: {
					action: 0,
					impact: TransitionImpact.LocalOnly
				},
				actorRef,
				localHandler: {
					editDb,
					editMemoryModel
				}
			})
			expect(editDb).not.toHaveBeenCalled()
			expect(actorRefSend).not.toHaveBeenCalled()
			expect(editMemoryModel).toHaveBeenCalledOnce()

			runner.syncResources(
				{
					db: {} as LocalDatabase
				},
				{
					ws: WsResourceStatus.Disconnected,
					db: DbResourceStatus.ConnectedAndMigrated
				}
			)

			expect(editDb).toHaveBeenCalledOnce()
			expect(actorRefSend).toHaveBeenCalledExactlyOnceWith({
				type: 'transition complete',
				id: 0
			})
			expect(actorRefSend).toHaveBeenCalledAfter(editDb)
		})
		it('does nothing on an event if no editDb is provided', () => {
			const editMemoryModel = vi
				.fn()
				.mockImplementation(() => new Promise(() => {}))
			const runner = new LocalOnlyTransitionRunner({
				initialResources: {},
				memoryModel: {
					tom: 'normal'
				},
				resourceStatus: {
					ws: WsResourceStatus.Disconnected,
					db: DbResourceStatus.Disconnected
				},
				id: 0,
				transition: {
					action: 0,
					impact: TransitionImpact.LocalOnly
				},
				actorRef,
				localHandler: {
					editMemoryModel
				}
			})
			expect(actorRefSend).not.toHaveBeenCalled()
			expect(editMemoryModel).toHaveBeenCalledOnce()

			runner.syncResources(
				{
					db: {} as LocalDatabase
				},
				{
					ws: WsResourceStatus.Disconnected,
					db: DbResourceStatus.ConnectedAndMigrated
				}
			)

			expect(actorRefSend).not.toHaveBeenCalled()
			expect(editMemoryModel).toHaveBeenCalledOnce()
		})
	})
	describe('on local database never connecting', () => {
		it('automatically completes alone', () => {
			const editDb = vi.fn()
			const runner = new LocalOnlyTransitionRunner({
				initialResources: {},
				memoryModel: {
					tom: 'normal'
				},
				resourceStatus: {
					ws: WsResourceStatus.Disconnected,
					db: DbResourceStatus.Disconnected
				},
				id: 0,
				transition: {
					action: 0,
					impact: TransitionImpact.LocalOnly
				},
				actorRef,
				localHandler: {
					editDb
				}
			})
			expect(editDb).not.toHaveBeenCalled()
			expect(actorRefSend).not.toHaveBeenCalled()

			runner.syncResources(
				{},
				{
					ws: WsResourceStatus.Disconnected,
					db: DbResourceStatus.NeverConnecting
				}
			)

			expect(editDb).not.toHaveBeenCalled()
			expect(actorRefSend).toHaveBeenCalledExactlyOnceWith({
				type: 'transition complete',
				id: 0
			})
		})
		it('automatically completes with memory model handler complete', () => {
			const editDb = vi.fn()
			const editMemoryModel = vi.fn()
			const runner = new LocalOnlyTransitionRunner({
				initialResources: {},
				memoryModel: {
					tom: 'normal'
				},
				resourceStatus: {
					ws: WsResourceStatus.Disconnected,
					db: DbResourceStatus.Disconnected
				},
				id: 0,
				transition: {
					action: 0,
					impact: TransitionImpact.LocalOnly
				},
				actorRef,
				localHandler: {
					editDb,
					editMemoryModel
				}
			})
			expect(editDb).not.toHaveBeenCalled()
			expect(actorRefSend).not.toHaveBeenCalled()
			expect(editMemoryModel).toHaveBeenCalledOnce()

			runner.syncResources(
				{},
				{
					ws: WsResourceStatus.Disconnected,
					db: DbResourceStatus.NeverConnecting
				}
			)

			expect(editDb).not.toHaveBeenCalled()
			expect(actorRefSend).toHaveBeenCalledExactlyOnceWith({
				type: 'transition complete',
				id: 0
			})
		})
	})
})
it('does nothing on ws status change', () => {
	const editDb = vi.fn().mockImplementation(() => new Promise(() => {}))
	const editMemoryModel = vi
		.fn()
		.mockImplementation(() => new Promise(() => {}))
	const runner = new LocalOnlyTransitionRunner({
		initialResources: {},
		memoryModel: {
			tom: 'normal'
		},
		resourceStatus: {
			ws: WsResourceStatus.Disconnected,
			db: DbResourceStatus.Disconnected
		},
		id: 0,
		transition: {
			action: 0,
			impact: TransitionImpact.LocalOnly
		},
		actorRef,
		localHandler: {
			editDb,
			editMemoryModel
		}
	})
	expect(editDb).not.toHaveBeenCalled()
	expect(actorRefSend).not.toHaveBeenCalled()
	expect(editMemoryModel).toHaveBeenCalledOnce()

	runner.syncResources(
		{},
		{
			ws: WsResourceStatus.Connected,
			db: DbResourceStatus.Disconnected
		}
	)

	expect(editDb).not.toHaveBeenCalled()
	expect(actorRefSend).not.toHaveBeenCalled()
	expect(editMemoryModel).toHaveBeenCalledOnce()
})
