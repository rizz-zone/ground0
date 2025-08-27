import type { ResourceBundle } from '@/types/status/ResourceBundle'
import type {
	LocalDatabase,
	LocalHandlers,
	Transition,
	TransitionImpact
} from '@ground0/shared'
import { and, assign, setup } from 'xstate'

export const optimisticPushMachine = setup({
	types: {
		events: {} as
			| {
					type: 'init'
					resourceBundle: ResourceBundle
					finalise: () => unknown
					memoryModel: object
					localHandlers: LocalHandlers<
						object,
						Transition & { impact: TransitionImpact.OptimisticPush }
					>
					transitionObj: Transition
			  }
			| { type: 'memory model edit completed' }
			| { type: 'memory model edit failed' }
			| { type: 'memory model revert completed' }
			| { type: 'memory model revert failed' }
			| { type: 'db edit completed' }
			| { type: 'db edit failed' }
			| { type: 'db revert completed' }
			| { type: 'db revert failed' }
			| { type: 'db connected'; db: LocalDatabase }
			| { type: 'db will not arrive' }
			| { type: 'ws connected'; ws: WebSocket }
			| { type: 'ws confirmed' }
			| { type: 'ws rejected' }
	},
	actions: {
		editMemoryModel: () => {},
		editDb: () => {},
		revertMemoryModel: () => {},
		revertDb: () => {},
		setFinaliseFunction: assign(() => ({})),
		setWs: assign(() => ({})),
		setDb: assign(() => ({})),
		setMemoryModel: assign(() => ({})),
		setMemoryModelHandlerFunctions: assign(() => ({})),
		setDbHandlerFunctions: assign(() => ({})),
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
	on: {
		init: {
			actions: ['setMemoryModel', 'setFinaliseFunction']
		}
	},
	states: {
		ws: {
			initial: 'no response',
			states: {
				'no response': {
					on: {
						init: {
							actions: ['setWs', 'sendWsMessage']
						},
						'ws connected': {
							actions: ['setWs', 'sendWsMessage']
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
								target: 'in progress',
								actions: ['setMemoryModelHandlerFunctions']
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
								target: 'in progress',
								actions: ['setDb', 'setDbHandlerFunctions']
							},
							{
								guard: 'dbFunctionInProvidedHandler',
								target: 'awaiting resources',
								actions: ['setDbHandlerFunctions']
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
					entry: [{ type: 'logFailure', params: 'db' }, 'finaliseIfApplicable'],
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
