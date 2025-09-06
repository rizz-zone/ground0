import {
	DATABASE_HANDLER_REQUESTED_WITHOUT_DB,
	InternalStateError,
	minimallyIdentifiedErrorLog,
	nonexistentHandlerFnRequired,
	UpstreamWsMessageAction,
	type TransitionImpact,
	type UpstreamWsMessage
} from '@ground0/shared'
import { TransitionRunner, type Ingredients } from '../base'
import {
	createActor,
	setup,
	type ActorRefFrom,
	type SnapshotFrom
} from 'xstate'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import SuperJSON from 'superjson'

// Optimistic transitions do something with the db and/or memory model
// immediately, and revert if the server says they should.
export class OptimisticPushTransitionRunner<
	MemoryModel extends object
> extends TransitionRunner<MemoryModel, TransitionImpact.OptimisticPush> {
	private readonly machine = setup({
		types: {
			events: {} as
				| { type: 'init' }
				| { type: 'memory model edit completed' }
				| { type: 'memory model edit failed' }
				| { type: 'memory model revert completed' }
				| { type: 'memory model revert failed' }
				| { type: 'db edit completed' }
				| { type: 'db edit failed' }
				| { type: 'db revert completed' }
				| { type: 'db revert failed' }
				| { type: 'db connected' }
				| { type: 'db will not arrive' }
				| { type: 'ws connected' }
				| { type: 'ws confirmed' }
				| { type: 'ws rejected' }
		},
		actions: {
			editMemoryModel: ({ self }) => {
				if (!('editMemoryModel' in this.localHandler))
					/* v8 ignore start */
					throw new InternalStateError(
						nonexistentHandlerFnRequired('editMemoryModel')
					)
				/* v8 ignore stop */

				const onSucceed = () =>
					self.send({ type: 'memory model edit completed' })
				const onFail = () => self.send({ type: 'memory model edit failed' })
				try {
					Promise.resolve(
						this.localHandler.editMemoryModel({
							data: this.transitionObj.data,
							memoryModel: this.memoryModel
						})
					).then(onSucceed, onFail)
				} catch {
					onFail()
				}
			},
			editDb: ({ self }) => {
				if (!('editDb' in this.localHandler))
					/* v8 ignore next */
					throw new InternalStateError(nonexistentHandlerFnRequired('editDb'))
				if (this.resources.db.status !== DbResourceStatus.ConnectedAndMigrated)
					/* v8 ignore next */
					throw new InternalStateError(DATABASE_HANDLER_REQUESTED_WITHOUT_DB)

				const onSucceed = () => self.send({ type: 'db edit completed' })
				const onFail = () => self.send({ type: 'db edit failed' })
				try {
					Promise.resolve(
						this.localHandler.editDb({
							data: this.transitionObj.data,
							db: this.resources.db.instance
						})
					).then(onSucceed, onFail)
				} catch {
					onFail()
				}
			},
			revertMemoryModel: ({ self }) => {
				if (!('revertMemoryModel' in this.localHandler))
					throw new InternalStateError(
						nonexistentHandlerFnRequired('revertMemoryModel')
					)

				const onSucceed = () =>
					self.send({ type: 'memory model revert completed' })
				const onFail = () => self.send({ type: 'memory model revert failed' })
				try {
					Promise.resolve(
						this.localHandler.revertMemoryModel({
							data: this.transitionObj.data,
							memoryModel: this.memoryModel
						})
					).then(onSucceed, onFail)
				} catch {
					onFail()
				}
			},
			revertDb: ({ self }) => {
				if (!('revertDb' in this.localHandler))
					throw new InternalStateError(nonexistentHandlerFnRequired('revertDb'))
				if (this.resources.db.status !== DbResourceStatus.ConnectedAndMigrated)
					/* v8 ignore next */
					throw new InternalStateError(DATABASE_HANDLER_REQUESTED_WITHOUT_DB)

				const onSucceed = () => self.send({ type: 'db revert completed' })
				const onFail = () => self.send({ type: 'db revert failed' })
				try {
					Promise.resolve(
						this.localHandler.revertDb({
							data: this.transitionObj.data,
							db: this.resources.db.instance
						})
					).then(onSucceed, onFail)
				} catch {
					onFail()
				}
			},
			logFailure: (_, responsibleHandlerArea: 'memory model' | 'db') => {
				console.warn(minimallyIdentifiedErrorLog(responsibleHandlerArea))
			},
			sendWsMessage: () => {
				if (this.resources.ws.status === WsResourceStatus.Connected)
					this.resources.ws.instance.send(
						SuperJSON.stringify({
							action: UpstreamWsMessageAction.Transition,
							id: this.id,
							data: this.transitionObj
						} satisfies UpstreamWsMessage)
					)
			},
			finaliseIfApplicable: ({ self }) => {
				queueMicrotask(() => {
					const snapshot = self.getSnapshot() as SnapshotFrom<
						typeof this.machine
					>
					if (snapshot.matches({ ws: 'no response' })) return
					const wsConfirmed = snapshot.matches({ ws: 'confirmed' })

					// Check if we're in a 'completed' state. If we're not, we
					// shouldn't finalise yet.
					if (
						!(
							snapshot.matches({ db: 'not required' }) ||
							snapshot.matches({ db: 'failed' }) ||
							snapshot.matches({ db: 'not possible' }) ||
							(wsConfirmed && snapshot.matches({ db: 'completed' })) ||
							(!wsConfirmed && snapshot.matches({ db: 'reverted' }))
						) ||
						!(
							snapshot.matches({ 'memory model': 'not required' }) ||
							snapshot.matches({ 'memory model': 'failed' }) ||
							(wsConfirmed &&
								snapshot.matches({ 'memory model': 'completed' })) ||
							(!wsConfirmed && snapshot.matches({ 'memory model': 'reverted' }))
						)
					)
						return

					// The transition is complete.
					this.markComplete()
				})
			}
		},
		guards: {
			memoryModelFunctionNotInHandler: () =>
				!('editMemoryModel' in this.localHandler),
			dbFunctionNotInHandler: () => !('editDb' in this.localHandler),
			dbConnected: () =>
				this.resources.db.status === DbResourceStatus.ConnectedAndMigrated,
			dbWillNotArrive: () =>
				this.resources.db.status === DbResourceStatus.NeverConnecting
		}
	}).createMachine({
		type: 'parallel',
		states: {
			ws: {
				initial: 'no response',
				states: {
					'no response': {
						on: {
							init: {
								actions: ['sendWsMessage']
							},
							'ws connected': {
								actions: ['sendWsMessage']
							},
							'ws confirmed': {
								target: 'confirmed'
							},
							'ws rejected': {
								target: 'rejected'
							}
						}
					},
					confirmed: {
						entry: 'finaliseIfApplicable'
					},
					rejected: {
						entry: 'finaliseIfApplicable'
					}
				}
			},
			'memory model': {
				initial: 'not evaluated',
				states: {
					'not evaluated': {
						on: {
							init: [
								{
									guard: 'memoryModelFunctionNotInHandler',
									target: 'not required'
								},
								{
									target: 'in progress'
								}
							]
						}
					},
					'in progress': {
						entry: 'editMemoryModel',
						on: {
							'memory model edit failed': {
								target: 'failed'
							},
							'memory model edit completed': {
								target: 'completed'
							}
						}
					},
					failed: {
						entry: [
							{ type: 'logFailure', params: 'memory model' },
							'finaliseIfApplicable'
						],
						type: 'final'
					},
					completed: {
						entry: 'finaliseIfApplicable',
						on: {
							'ws rejected': {
								target: 'reverting'
							}
						}
					},
					reverting: {
						entry: 'revertMemoryModel',
						on: {
							'memory model revert failed': {
								target: 'failed'
							},
							'memory model revert completed': {
								target: 'reverted'
							}
						}
					},
					reverted: {
						entry: 'finaliseIfApplicable',
						type: 'final'
					},
					'not required': { type: 'final' }
				}
			},
			db: {
				initial: 'not evaluated',
				states: {
					'not evaluated': {
						on: {
							init: [
								{
									guard: 'dbFunctionNotInHandler',
									target: 'not required'
								},
								{
									guard: 'dbWillNotArrive',
									target: 'not possible'
								},
								{
									guard: 'dbConnected',
									target: 'in progress'
								},
								{
									target: 'awaiting resources'
								}
							]
						}
					},
					'awaiting resources': {
						on: {
							'db connected': {
								target: 'in progress'
							},
							'db will not arrive': {
								target: 'not possible'
							},
							'ws rejected': {
								target: 'did not begin executing before rejection'
							}
						}
					},
					'in progress': {
						entry: 'editDb',
						on: {
							'db edit failed': {
								target: 'failed'
							},
							'db edit completed': {
								target: 'completed'
							}
						}
					},
					completed: {
						entry: 'finaliseIfApplicable',
						on: {
							'ws rejected': {
								target: 'reverting'
							}
						}
					},
					failed: {
						entry: [
							{ type: 'logFailure', params: 'db' },
							'finaliseIfApplicable'
						],
						type: 'final'
					},
					reverting: {
						entry: 'revertDb',
						on: {
							'db revert failed': {
								target: 'failed'
							},
							'db revert completed': {
								target: 'reverted'
							}
						}
					},
					reverted: {
						entry: 'finaliseIfApplicable',
						type: 'final'
					},
					'did not begin executing before rejection': {
						type: 'final'
					},
					'not required': {
						type: 'final'
					},
					'not possible': {
						entry: 'finaliseIfApplicable',
						type: 'final'
					}
				}
			}
		}
	})
	private readonly machineActorRef: ActorRefFrom<typeof this.machine>

	public constructor(
		ingredients: Ingredients<MemoryModel, TransitionImpact.OptimisticPush>
	) {
		super(ingredients)
		this.machineActorRef = createActor(this.machine)
		this.machineActorRef.start()
		this.machineActorRef.send({ type: 'init' })
	}
	protected override onDbConnected() {
		this.machineActorRef.send({ type: 'db connected' })
	}
	protected override onDbConfirmedNeverConnecting() {
		this.machineActorRef.send({ type: 'db will not arrive' })
	}
	protected override onWsConnected() {
		this.machineActorRef.send({ type: 'ws connected' })
	}

	public reportWsResult(confirmed: boolean) {
		this.machineActorRef.send({
			type: confirmed ? 'ws confirmed' : 'ws rejected'
		})
	}
}
