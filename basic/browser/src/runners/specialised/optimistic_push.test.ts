import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import { TransitionImpact } from '@ground0/shared'
import type { Ingredients } from '../base'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { createActor } from 'xstate'
import { OptimisticPushTransitionRunner } from './optimistic_push'

const bareMinimumIngredients = {
	memoryModel: {},
	resources: {
		db: { status: DbResourceStatus.Disconnected },
		ws: { status: WsResourceStatus.Disconnected }
	},
	id: {},
	actorRef: {},
	localHandler: {}
} as Omit<
	Ingredients<Record<string, never>, TransitionImpact.OptimisticPush>,
	'transition'
>

vi.mock('xstate', { spy: true })
afterEach(vi.clearAllMocks)

test('constructor creates one instance of the machine, starts it, and inits it', () => {
	const ingredients: Ingredients<
		Record<string, never>,
		TransitionImpact.OptimisticPush
	> = {
		...bareMinimumIngredients,
		transition: {
			action: 'transition4',
			impact: TransitionImpact.OptimisticPush
		}
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
		// TODO: Complete this
	})
})
