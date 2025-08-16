import type { TransitionImpact } from '@ground0/shared'
import { TransitionRunner, type Ingredients } from './base'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import type { LocalDatabase } from '../../../shared/dist/types/LocalDatabase'

const onDbConnected = vi.fn()
const onDbConfirmedNeverConnecting = vi.fn()
const onWsConnected = vi.fn()

// TransitionRunner is abstract *and* a generic, so we need to extend it
class NotVeryUsefulRunner extends TransitionRunner<
	Record<string, never>,
	TransitionImpact
> {
	public override onDbConnected(): void {
		onDbConnected()
	}
	public override onDbConfirmedNeverConnecting(): void {
		onDbConfirmedNeverConnecting()
	}
	public override onWsConnected(): void {
		onWsConnected()
	}

	public constructor(
		ingredients: Ingredients<Record<string, never>, TransitionImpact>
	) {
		super(ingredients)
	}
}

const bareMinimumIngredients = {
	initialResources: {},
	memoryModel: {},
	resourceStatus: {
		db: DbResourceStatus.Disconnected,
		ws: WsResourceStatus.Disconnected
	},
	id: {},
	transition: {},
	actorRef: {},
	localHandler: {}
} as Ingredients<Record<string, never>, TransitionImpact>
type ResourcesForSync = Partial<{ ws: WebSocket; db: LocalDatabase }>

describe('constructor', () => {
	test('sets the things that always have to be set', () => {
		const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.localHandler).toBe(
			bareMinimumIngredients.localHandler
		)
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.actorRef).toBe(bareMinimumIngredients.actorRef)
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.resourceStatus).toBe(
			bareMinimumIngredients.resourceStatus
		)
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.transitionObj).toBe(bareMinimumIngredients.transition)
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.id).toBe(bareMinimumIngredients.id)

		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.ws).toBeUndefined()
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.db).toBeUndefined()
	})
	describe('conditional resource assignments', () => {
		test('assigns ws resource if present', () => {
			const slightlyLessBareMinimumIngredients = {
				...bareMinimumIngredients,
				initialResources: {
					ws: {}
				}
			} as Ingredients<Record<string, never>, TransitionImpact>
			const runnerInstance = new NotVeryUsefulRunner(
				slightlyLessBareMinimumIngredients
			)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.ws).toBe(
				slightlyLessBareMinimumIngredients.initialResources.ws
			)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.db).toBeUndefined()
		})
		test('assigns db resource if present', () => {
			const slightlyLessBareMinimumIngredients = {
				...bareMinimumIngredients,
				initialResources: {
					db: {}
				}
			} as Ingredients<Record<string, never>, TransitionImpact>
			const runnerInstance = new NotVeryUsefulRunner(
				slightlyLessBareMinimumIngredients
			)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.ws).toBeUndefined()
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.db).toBe(
				slightlyLessBareMinimumIngredients.initialResources.db
			)
		})
		test('assigns ws and db resource if present', () => {
			const slightlyLessBareMinimumIngredients = {
				...bareMinimumIngredients,
				initialResources: {
					ws: {},
					db: {}
				}
			} as Ingredients<Record<string, never>, TransitionImpact>
			const runnerInstance = new NotVeryUsefulRunner(
				slightlyLessBareMinimumIngredients
			)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.ws).toBe(
				slightlyLessBareMinimumIngredients.initialResources.ws
			)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.db).toBe(
				slightlyLessBareMinimumIngredients.initialResources.db
			)
		})
	})
})
describe('syncResources', () => {
	describe('change-based assignments', () => {
		test('db only', () => {
			const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.db).toBeUndefined()
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.ws).toBeUndefined()
			const db = {}
			runnerInstance.syncResources({ db } as ResourcesForSync, {
				db: DbResourceStatus.ConnectedAndMigrated,
				ws: WsResourceStatus.Disconnected
			})
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.db).toBe(db)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.ws).toBeUndefined()
		})
		test('ws only', () => {
			const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.ws).toBeUndefined()
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.db).toBeUndefined()
			const ws = {}
			runnerInstance.syncResources({ ws } as ResourcesForSync, {
				db: DbResourceStatus.Disconnected,
				ws: WsResourceStatus.Connected
			})
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.ws).toBe(ws)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.db).toBeUndefined()
		})
		test('both', () => {
			const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.ws).toBeUndefined()
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.db).toBeUndefined()
			const ws = {}
			const db = {}
			runnerInstance.syncResources({ ws, db } as ResourcesForSync, {
				db: DbResourceStatus.ConnectedAndMigrated,
				ws: WsResourceStatus.Connected
			})
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.ws).toBe(ws)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.db).toBe(db)
		})
		test('neither', () => {
			const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.ws).toBeUndefined()
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.db).toBeUndefined()
			runnerInstance.syncResources({} as ResourcesForSync, {
				db: DbResourceStatus.Disconnected,
				ws: WsResourceStatus.Disconnected
			})
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.ws).toBeUndefined()
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.db).toBeUndefined()
		})
	})
	describe('status changes', () => {
		beforeEach(vi.clearAllMocks)
		describe('requiring callbacks', () => {
			test('db Disconnected → ConnectedAndMigrated', () => {
				const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
				runnerInstance.syncResources({} as ResourcesForSync, {
					db: DbResourceStatus.ConnectedAndMigrated,
					ws: WsResourceStatus.Disconnected
				})
				expect(onDbConnected).toHaveBeenCalledOnce()
				expect(onDbConfirmedNeverConnecting).not.toHaveBeenCalled()
				expect(onWsConnected).not.toHaveBeenCalled()
			})
			test('db Disconnected → NeverConnecting', () => {
				const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
				runnerInstance.syncResources({} as ResourcesForSync, {
					db: DbResourceStatus.NeverConnecting,
					ws: WsResourceStatus.Disconnected
				})
				expect(onDbConnected).not.toHaveBeenCalled()
				expect(onDbConfirmedNeverConnecting).toHaveBeenCalledOnce()
				expect(onWsConnected).not.toHaveBeenCalled()
			})
			test('ws Disconnected → Connected', () => {
				const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
				runnerInstance.syncResources({} as ResourcesForSync, {
					db: DbResourceStatus.Disconnected,
					ws: WsResourceStatus.Connected
				})
				expect(onDbConnected).not.toHaveBeenCalled()
				expect(onDbConfirmedNeverConnecting).not.toHaveBeenCalled()
				expect(onWsConnected).toHaveBeenCalledOnce()
			})
		})
		describe('not requiring callbacks', () => {
			test('existing conditions', () => {
				for (const status of [
					{
						db: DbResourceStatus.Disconnected,
						ws: WsResourceStatus.Connected
					},
					{
						db: DbResourceStatus.ConnectedAndMigrated,
						ws: WsResourceStatus.Disconnected
					},
					{
						db: DbResourceStatus.NeverConnecting,
						ws: WsResourceStatus.Disconnected
					},
					{
						db: DbResourceStatus.ConnectedAndMigrated,
						ws: WsResourceStatus.Connected
					},
					{
						db: DbResourceStatus.NeverConnecting,
						ws: WsResourceStatus.Disconnected
					}
				]) {
					const runnerInstance = new NotVeryUsefulRunner({
						...bareMinimumIngredients,
						resourceStatus: status
					})
					runnerInstance.syncResources({}, status)
					expect(onDbConnected).not.toHaveBeenCalled()
					expect(onDbConfirmedNeverConnecting).not.toHaveBeenCalled()
					expect(onWsConnected).not.toHaveBeenCalled()
				}
			})
		})
	})
	test('sets this.resourceStatus', () => {
		const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
		const newStatus = {
			db: DbResourceStatus.Disconnected,
			ws: WsResourceStatus.Disconnected
		}

		// Note for the future: It might eventually make more sense to copy the
		// status instead of simply using it, as there is a minimal amount of
		// risk the current approach presents (the status *could* change
		// without a call to syncResources). If a copy is used, this test and a
		// few others will need to use toDeepEqual instead.

		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.resourceStatus).toBe(
			bareMinimumIngredients.resourceStatus
		)
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.resourceStatus).not.toBe(newStatus)
		runnerInstance.syncResources({}, newStatus)
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.resourceStatus).not.toBe(
			bareMinimumIngredients.resourceStatus
		)
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.resourceStatus).toBe(newStatus)
	})
})
test('markComplete sends transition complete event', () => {
	const fn = vi.fn()
	const ingredientsWithActor = {
		...bareMinimumIngredients,
		actorRef: {
			send: fn
		}
	} as unknown as Ingredients<Record<string, never>, TransitionImpact>
	const runnerInstance = new NotVeryUsefulRunner(ingredientsWithActor)
	expect(fn).not.toHaveBeenCalled()

	// @ts-expect-error We need to see the private stuff
	runnerInstance.markComplete()

	expect(fn).toHaveBeenCalledExactlyOnceWith({
		type: 'transition complete',
		// @ts-expect-error We need to see the private stuff
		id: runnerInstance.id
	})
})
