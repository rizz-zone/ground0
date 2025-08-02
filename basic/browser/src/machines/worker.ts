import {
	InternalStateError,
	UpstreamWsMessageAction,
	WORKER_MACHINE_RUNNING_WITHOUT_PROPER_INIT,
	type UpstreamWsMessage
} from '@ground0/shared'
import SuperJSON from 'superjson'
import { assign, setup } from 'xstate'

export const clientMachine = setup({
	types: {
		context: {} as {
			socket?: WebSocket
			wsUrl?: string
			socketInterval?: ReturnType<typeof setInterval>
			dbName?: string
			version?: string
		},
		events: {} as
			| { type: 'init'; wsUrl: string; dbName: string }
			| { type: 'ws connected' }
			| { type: 'ws connection issue' }
			| { type: 'db connected' }
			| { type: 'db cannot connect' }
			| { type: 'leader lock acquired' }
			| { type: 'socket ping time' }
	},
	actions: {
		establishSocket: assign(({ context, self }) => {
			if (!context.wsUrl) return {}
			const socket = new WebSocket(context.wsUrl)
			socket.onopen = () => {
				self.send({ type: 'ws connected' })
			}
			return { socket }
		}),
		establishDb: assign(() => ({})),
		initWsUrl: assign(({ event }) => {
			if (event.type !== 'init') /* v8 ignore next */ return {}
			return { wsUrl: event.wsUrl }
		}),
		initDbName: assign(({ event }) => {
			if (event.type !== 'init') /* v8 ignore next */ return {}
			return { dbName: `${event.dbName}.sqlite` }
		}),
		requestLock: ({ self }) =>
			navigator.locks.request(
				'leader',
				() => new Promise(() => self.send({ type: 'leader lock acquired' }))
			),
		wsInitMessage: ({ context }) => {
			const { socket, version } = context
			if (!version)
				throw new InternalStateError(WORKER_MACHINE_RUNNING_WITHOUT_PROPER_INIT)
			if (!socket || socket.readyState !== WebSocket.OPEN) return
			socket.send(
				SuperJSON.stringify({
					action: UpstreamWsMessageAction.Init,
					version
				} satisfies UpstreamWsMessage)
			)
		},
		createPingInterval: assign(({ context, self }) => {
			const { socket } = context
			if (!socket || socket.readyState !== WebSocket.OPEN) return {}
			return {
				socketInterval: setInterval(
					() => self.send({ type: 'socket ping time' }),
					(5 * 1000) / 3
				)
			}
		})
	}
}).createMachine({
	type: 'parallel',
	states: {
		websocket: {
			initial: 'disconnected',
			states: {
				disconnected: {
					entry: 'establishSocket',
					on: {
						init: {
							actions: ['initWsUrl', 'establishSocket']
						},
						'ws connected': {
							target: 'connected'
						}
					}
				},
				connected: {
					entry: ['wsInitMessage', 'createPingInterval'],
					on: {
						'ws connection issue': {
							target: 'disconnected'
						}
					}
				}
			}
		},
		db: {
			initial: 'disconnected',
			states: {
				disconnected: {
					on: {
						init: {
							actions: ['initDbName']
						},
						'db connected': {
							target: 'connected'
						},
						'db cannot connect': {
							target: 'will never connect'
						}
					}
				},
				'will never connect': {
					type: 'final'
				},
				connected: {
					type: 'final'
				}
			}
		},
		superiority: {
			initial: 'follower',
			states: {
				follower: {
					on: {
						'leader lock acquired': {
							target: 'leader'
						},
						init: {
							actions: ['requestLock']
						}
					}
				},
				leader: {
					type: 'final'
				}
			}
		}
	}
})
