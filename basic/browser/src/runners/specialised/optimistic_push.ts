import { type TransitionImpact } from '@ground0/shared'
import { TransitionRunner, type Ingredients } from '../base'
import { and, createActor, setup, type ActorRefFrom } from 'xstate'

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
			editMemoryModel: () => {},
			editDb: () => {},
			revertMemoryModel: () => {},
			revertDb: () => {},
			logFailure: (_, responsibleHandlerArea: 'memory model' | 'db') => {
				console.log(responsibleHandlerArea)
			},
			sendWsMessage: () => {},
			finaliseIfApplicable: () => {}
		},
		guards: {
			memoryModelFunctionInProvidedHandler: ({ event }) =>
				event.type === 'init' /* && event.something */,
			dbFunctionInProvidedHandler: ({ event }) =>
				event.type === 'init' /* && event.somethingElse */,
			dbConnectedAndProvided: ({ event }) =>
				event.type === 'init' /* && event.somethingElse */,
			dbWillNotArrive: ({ event }) =>
				event.type === 'init' /* && event.somethingElse */
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
						entry: 'finaliseIfApplicable',
						type: 'final'
					},
					rejected: {
						entry: 'finaliseIfApplicable',
						type: 'final'
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
									guard: 'memoryModelFunctionInProvidedHandler',
									target: 'in progress'
								},
								{
									target: 'not required'
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
					'not required': {
						type: 'final'
					}
				}
			},
			db: {
				initial: 'not evaluated',
				states: {
					'not evaluated': {
						on: {
							init: [
								{
									guard: 'dbWillNotArrive',
									target: 'not possible'
								},
								{
									guard: and([
										'dbFunctionInProvidedHandler',
										'dbConnectedAndProvided'
									]),
									target: 'in progress'
								},
								{
									guard: 'dbFunctionInProvidedHandler',
									target: 'awaiting resources'
								},
								{
									target: 'not required'
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
}
