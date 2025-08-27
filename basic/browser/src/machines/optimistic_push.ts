import { setup } from 'xstate'

export const optimisticPushMachine = setup({
	types: {
		events: {} as
			| { type: 'init' }
			| { type: 'memory model completed' }
			| { type: 'memory model failed' }
			| { type: 'ws responded'; confirmed: boolean }
	},
	actions: {
		editMemoryModel: () => {}
	},
	guards: {
		memoryModelInProvidedHandler: ({ event }) =>
			event.type === 'init' /* && event.something */,
		wsResponseIsConfirmation: ({ event }) =>
			event.type === 'ws responded' && event.confirmed
	}
}).createMachine({
	type: 'parallel',
	states: {
		ws: {
			initial: 'no response',
			states: {
				'no response': {
					on: {
						'ws responded': [
							{
								guard: 'wsResponseIsConfirmation',
								target: 'confirmed'
							},
							{
								target: 'rejected'
							}
						]
					}
				},
				confirmed: {
					type: 'final'
				},
				rejected: {
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
								guard: 'memoryModelInProvidedHandler',
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
						'memory model failed': {
							target: 'failed'
						},
						'memory model completed': {
							target: 'completed'
						}
					}
				},
				failed: {
					type: 'final'
				},
				completed: {},
				reverting: {},
				reverted: {
					type: 'final'
				},
				'not required': {
					type: 'final'
				}
			}
		}
	}
})
