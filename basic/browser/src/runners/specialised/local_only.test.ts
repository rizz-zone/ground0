import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocalOnlyTransitionRunner } from './local_only'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { TransitionImpact } from '@ground0/shared'
import type { SomeActorRef } from '@/types/SomeActorRef'
import type { Transformation } from '@/types/memory_model/Tranformation'
import { TransformationAction } from '@/types/memory_model/TransformationAction'

// const announceComplete = vi.fn()
// const announceTransformation = vi.fn()
const actorRefSend = vi.fn()
const actorRef = { send: actorRefSend } as unknown as SomeActorRef
afterEach(vi.clearAllMocks)

describe('handling in constructor', () => {
	describe('sync', () => {
		it('immediately completes with memory model only', () => {
			const editMemoryModel = vi.fn().mockImplementation((data) => {
				data.memoryModel.tom = 'plus'
			})
			new LocalOnlyTransitionRunner({
				initialResources: {},
				initialMemoryModel: {
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
				initialMemoryModel: {
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
	})
})
