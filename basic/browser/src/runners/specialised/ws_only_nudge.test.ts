import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WsOnlyNudgeTransitionRunner } from './ws_only_nudge'
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

describe('WsOnlyNudgeTransitionRunner', () => {
	const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
	beforeEach(() => consoleWarn.mockImplementation(() => {}))

	describe('constructor behavior', () => {
		test('does not send message when ws is disconnected', () => {
			const markComplete = vi.fn()
			new WsOnlyNudgeTransitionRunner({
				memoryModel: {},
				resources: { ...baseResources },
				id: 1,
				transition: {
					action: 'nudge1',
					impact: TransitionImpact.WsOnlyNudge
				},
				markComplete,
				localHandler: {}
			})
			expect(markComplete).not.toHaveBeenCalled()
		})

		test('sends message immediately when ws is connected', () => {
			const send = vi.fn()
			const markComplete = vi.fn()
			const transition = {
				action: 'nudge1',
				impact: TransitionImpact.WsOnlyNudge
			} as const
			new WsOnlyNudgeTransitionRunner({
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
			// Should not mark complete until acknowledgeAcknowledgement is called
			expect(markComplete).not.toHaveBeenCalled()
		})
	})

	describe('ws connects later', () => {
		test('sends message when ws connects', () => {
			const send = vi.fn()
			const markComplete = vi.fn()
			const transition = {
				action: 'nudge2',
				impact: TransitionImpact.WsOnlyNudge
			} as const
			const runner = new WsOnlyNudgeTransitionRunner({
				memoryModel: {},
				resources: { ...baseResources },
				id: 10,
				transition,
				markComplete,
				localHandler: {}
			})
			expect(send).not.toHaveBeenCalled()

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
		})
	})

	describe('acknowledgeAcknowledgement', () => {
		test('marks the runner as complete', () => {
			const send = vi.fn()
			const markComplete = vi.fn()
			const runner = new WsOnlyNudgeTransitionRunner({
				memoryModel: {},
				resources: {
					db: { status: DbResourceStatus.Disconnected },
					ws: {
						status: WsResourceStatus.Connected,
						instance: { send } as unknown as WebSocket
					}
				},
				id: 7,
				transition: {
					action: 'nudge3',
					impact: TransitionImpact.WsOnlyNudge
				},
				markComplete,
				localHandler: {}
			})
			expect(markComplete).not.toHaveBeenCalled()

			runner.acknowledgeAcknowledgement()
			expect(markComplete).toHaveBeenCalledOnce()
		})
	})

	describe('db events (no-op)', () => {
		test('db connected event has no effect', () => {
			const send = vi.fn()
			const markComplete = vi.fn()
			const runner = new WsOnlyNudgeTransitionRunner({
				memoryModel: {},
				resources: { ...baseResources },
				id: 8,
				transition: {
					action: 'nudge4',
					impact: TransitionImpact.WsOnlyNudge
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
			const runner = new WsOnlyNudgeTransitionRunner({
				memoryModel: {},
				resources: { ...baseResources },
				id: 9,
				transition: {
					action: 'nudge5',
					impact: TransitionImpact.WsOnlyNudge
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
