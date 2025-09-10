import { InternalStateError, type TransitionImpact } from '@ground0/shared'
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
	memoryModel: {},
	resources: {
		db: { status: DbResourceStatus.Disconnected },
		ws: { status: WsResourceStatus.Disconnected }
	},
	id: {},
	transition: {},
	markComplete: {},
	localHandler: {}
} as Ingredients<Record<string, never>, TransitionImpact>

describe('constructor', () => {
	test('sets the things that always have to be set', () => {
		const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.localHandler).toBe(
			bareMinimumIngredients.localHandler
		)
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.sourceMarkComplete).toBe(
			bareMinimumIngredients.markComplete
		)
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.resources).toMatchObject(
			bareMinimumIngredients.resources
		)
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.transitionObj).toBe(bareMinimumIngredients.transition)
		// @ts-expect-error We need to see the private stuff
		expect(runnerInstance.id).toBe(bareMinimumIngredients.id)
	})
	describe('initial resource assignments', () => {
		test('assigns ws resource if present', () => {
			const instance = {}
			const runnerInstance = new NotVeryUsefulRunner({
				...bareMinimumIngredients,
				resources: {
					db: { status: DbResourceStatus.Disconnected },
					ws: { status: WsResourceStatus.Connected, instance }
				}
			} as Ingredients<Record<string, never>, TransitionImpact>)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.db.instance).toBeUndefined()
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.ws.instance).toBe(instance)
		})
		test('assigns db resource if present', () => {
			const instance = {}
			const runnerInstance = new NotVeryUsefulRunner({
				...bareMinimumIngredients,
				resources: {
					db: { status: DbResourceStatus.ConnectedAndMigrated, instance },
					ws: { status: WsResourceStatus.Disconnected }
				}
			} as Ingredients<Record<string, never>, TransitionImpact>)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.db.instance).toBe(instance)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.ws.instance).toBeUndefined()
		})
		test('assigns ws and db resource if present', () => {
			const instances = [{}, {}]
			const runnerInstance = new NotVeryUsefulRunner({
				...bareMinimumIngredients,
				resources: {
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: instances[0]
					},
					ws: { status: WsResourceStatus.Connected, instance: instances[1] }
				}
			} as Ingredients<Record<string, never>, TransitionImpact>)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.db.instance).toBe(instances[0])
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.ws.instance).toBe(instances[1])
		})
	})
})
describe('syncResources', () => {
	beforeEach(vi.clearAllMocks)
	describe('instance assignments', () => {
		test('db only', () => {
			const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
			const db = {
				status: DbResourceStatus.ConnectedAndMigrated,
				instance: {} as LocalDatabase
			}
			runnerInstance.syncResources({ db })
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.db).toBe(db)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.ws).toBe(
				bareMinimumIngredients.resources.ws
			)
		})
		test('ws only', () => {
			const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
			const ws = {
				status: WsResourceStatus.Connected,
				instance: {} as WebSocket
			}
			runnerInstance.syncResources({ ws })
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.ws).toBe(ws)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.db).toBe(
				bareMinimumIngredients.resources.db
			)
		})
		test('both', () => {
			const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
			const db = {
				status: DbResourceStatus.ConnectedAndMigrated,
				instance: {} as LocalDatabase
			}
			const ws = {
				status: WsResourceStatus.Connected,
				instance: {} as WebSocket
			}
			runnerInstance.syncResources({ ws, db })
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.ws).toBe(ws)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.db).toBe(db)
		})
		test('neither', () => {
			const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
			runnerInstance.syncResources({})
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.ws).toBe(
				bareMinimumIngredients.resources.ws
			)
			// @ts-expect-error We need to see the private stuff
			expect(runnerInstance.resources.db).toBe(
				bareMinimumIngredients.resources.db
			)
		})
	})
	describe('status changes', () => {
		describe('requiring callbacks', () => {
			test('db Disconnected → ConnectedAndMigrated', () => {
				const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
				runnerInstance.syncResources({
					db: {
						status: DbResourceStatus.ConnectedAndMigrated,
						instance: {} as LocalDatabase
					}
				})
				expect(onDbConnected).toHaveBeenCalledOnce()
				expect(onDbConfirmedNeverConnecting).not.toHaveBeenCalled()
				expect(onWsConnected).not.toHaveBeenCalled()
			})
			test('db Disconnected → NeverConnecting', () => {
				const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
				runnerInstance.syncResources({
					db: { status: DbResourceStatus.NeverConnecting }
				})
				expect(onDbConnected).not.toHaveBeenCalled()
				expect(onDbConfirmedNeverConnecting).toHaveBeenCalledOnce()
				expect(onWsConnected).not.toHaveBeenCalled()
			})
			test('ws Disconnected → Connected', () => {
				const runnerInstance = new NotVeryUsefulRunner(bareMinimumIngredients)
				runnerInstance.syncResources({
					ws: { status: WsResourceStatus.Connected, instance: {} as WebSocket }
				})
				expect(onDbConnected).not.toHaveBeenCalled()
				expect(onDbConfirmedNeverConnecting).not.toHaveBeenCalled()
				expect(onWsConnected).toHaveBeenCalledOnce()
			})
		})
		describe('not requiring callbacks', () => {
			test('db status is not disconnected', () => {
				const runnerInstance = new NotVeryUsefulRunner({
					...bareMinimumIngredients,
					resources: {
						...bareMinimumIngredients.resources,
						// @ts-expect-error This *is* incorrect and that's the
						// point of the test
						db: { status: DbResourceStatus.ConnectedAndMigrated }
					}
				})
				expect(() => {
					runnerInstance.syncResources({
						db: {
							status: DbResourceStatus.ConnectedAndMigrated,
							instance: {} as LocalDatabase
						}
					})
				}).toThrow(InternalStateError)
			})
		})
	})
})
test('markComplete sends transition complete event', () => {
	const fn = vi.fn()
	const ingredientsWithActor = {
		...bareMinimumIngredients,
		markComplete: fn
	} as unknown as Ingredients<Record<string, never>, TransitionImpact>
	const runnerInstance = new NotVeryUsefulRunner(ingredientsWithActor)
	expect(fn).not.toHaveBeenCalled()

	// @ts-expect-error We need to see the private stuff
	runnerInstance.markComplete()

	expect(fn).toHaveBeenCalledExactlyOnceWith()
})

test('markComplete only sends event once', () => {
	const fn = vi.fn()
	const ingredientsWithActor = {
		...bareMinimumIngredients,
		markComplete: fn
	} as unknown as Ingredients<Record<string, never>, TransitionImpact>
	const runnerInstance = new NotVeryUsefulRunner(ingredientsWithActor)
	expect(fn).not.toHaveBeenCalled()

	// @ts-expect-error We need to see the private stuff
	runnerInstance.markComplete()
	expect(fn).toHaveBeenCalledOnce()
	// @ts-expect-error We need to see the private stuff
	runnerInstance.markComplete()
	expect(fn).toHaveBeenCalledOnce()
})
