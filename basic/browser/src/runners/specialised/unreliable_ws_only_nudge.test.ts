import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { UnreliableWsOnlyNudgeTransitionRunner } from './unreliable_ws_only_nudge'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import {
	TransitionImpact,
	UpstreamWsMessageAction,
	type UpstreamWsMessage
} from '@ground0/shared'
import SuperJSON from 'superjson'

afterEach(vi.clearAllMocks)

const baseResources = {
	db: { status: DbResourceStatus.Disconnected } as const,
	ws: { status: WsResourceStatus.Disconnected } as const
}

describe('UnreliableWsOnlyNudgeTransitionRunner', () => {
	const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
	beforeEach(() => consoleWarn.mockImplementation(() => {}))

	describe('constructor behavior', () => {
		test('does not send message when ws is disconnected', () => {
			const markComplete = vi.fn()
			new UnreliableWsOnlyNudgeTransitionRunner({
				memoryModel: {},
				resources: { ...baseResources },
				id: 1,
				transition: {
					action: 'unreliable1',
					impact: TransitionImpact.UnreliableWsOnlyNudge
				},
				markComplete,
				localHandler: {}
			})
			expect(markComplete).not.toHaveBeenCalled()
		})

		test('sends message immediately and completes when ws is connected', () => {
			const send = vi.fn()
			const markComplete = vi.fn()
			const transition = {
				action: 'unreliable1',
				impact: TransitionImpact.UnreliableWsOnlyNudge
			} as const
			new UnreliableWsOnlyNudgeTransitionRunner({
				memoryModel: {},
				resources: {
					db: { status: DbResourceStatus.Disconnected },
					ws: {
						status: WsResourceStatus.Connected,
						instance: { send } as unknown as WebSocket
					}
				},
				id: 5,
				transition,
				markComplete,
				localHandler: {}
			})
			expect(send).toHaveBeenCalledOnce()
			expect(send).toHaveBeenCalledWith(
				SuperJSON.stringify({
					action: UpstreamWsMessageAction.Transition,
					id: 5,
					data: transition
				} satisfies UpstreamWsMessage)
			)
			// Unlike WsOnlyNudge, this marks complete immediately after sending
			expect(markComplete).toHaveBeenCalledOnce()
		})
	})

	describe('ws connects later', () => {
		test('sends message and completes when ws connects', () => {
			const send = vi.fn()
			const markComplete = vi.fn()
			const transition = {
				action: 'unreliable2',
				impact: TransitionImpact.UnreliableWsOnlyNudge
			} as const
			const runner = new UnreliableWsOnlyNudgeTransitionRunner({
				memoryModel: {},
				resources: { ...baseResources },
				id: 10,
				transition,
				markComplete,
				localHandler: {}
			})
			expect(send).not.toHaveBeenCalled()
			expect(markComplete).not.toHaveBeenCalled()

			runner.syncResources({
				ws: {
					status: WsResourceStatus.Connected,
					instance: { send } as unknown as WebSocket
				}
			})
			expect(send).toHaveBeenCalledOnce()
			expect(send).toHaveBeenCalledWith(
				SuperJSON.stringify({
					action: UpstreamWsMessageAction.Transition,
					id: 10,
					data: transition
				} satisfies UpstreamWsMessage)
			)
			expect(markComplete).toHaveBeenCalledOnce()
		})
	})

	describe('db events (no-op)', () => {
		test('db connected event has no effect', () => {
			const send = vi.fn()
			const markComplete = vi.fn()
			const runner = new UnreliableWsOnlyNudgeTransitionRunner({
				memoryModel: {},
				resources: { ...baseResources },
				id: 8,
				transition: {
					action: 'unreliable3',
					impact: TransitionImpact.UnreliableWsOnlyNudge
				},
				markComplete,
				localHandler: {}
			})
			runner.syncResources({
				db: {
					status: DbResourceStatus.ConnectedAndMigrated,
					instance: {} as never
				}
			})
			expect(send).not.toHaveBeenCalled()
			expect(markComplete).not.toHaveBeenCalled()
		})

		test('db never connecting event has no effect', () => {
			const markComplete = vi.fn()
			const runner = new UnreliableWsOnlyNudgeTransitionRunner({
				memoryModel: {},
				resources: { ...baseResources },
				id: 9,
				transition: {
					action: 'unreliable4',
					impact: TransitionImpact.UnreliableWsOnlyNudge
				},
				markComplete,
				localHandler: {}
			})
			runner.syncResources({
				db: { status: DbResourceStatus.NeverConnecting }
			})
			expect(markComplete).not.toHaveBeenCalled()
		})
	})
})
