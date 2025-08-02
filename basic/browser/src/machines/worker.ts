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
			dissatisfiedPings: number
		},
		events: {} as
			| { type: 'init'; wsUrl: string; dbName: string }
			| { type: 'ws connected' }
			| { type: 'ws connection issue' }
			| { type: 'db connected' }
			| { type: 'db cannot connect' }
			| { type: 'leader lock acquired' }
			| { type: 'socket ping time' }
			| { type: 'ping received' }
			| { type: 'socket has destabilised' }
			| { type: 'socket has stabilised' }
	},
	actions: {
		establishSocket: assign(({ context, self }) => {
			if (!context.wsUrl) return {}
			const socket = new WebSocket(context.wsUrl)
			socket.onopen = () => {
				self.send({ type: 'ws connected' })
			}
			socket.onmessage = (event) => {
				if (
					context.socket !== socket ||
					socket.readyState !== WebSocket.OPEN ||
					typeof event.data !== 'string'
				)
					return
				if (event.data === '!') self.send({ type: 'ping received' })
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
				),
				dissatisfiedPings: 0
			}
		}),
		acceptPing: assign(({ context }) => ({
			dissatisfiedPings: context.dissatisfiedPings - 1
		})),
		clearPingInterval: assign(({ context }) => {
			if (context.socketInterval) clearInterval(context.socketInterval)
			return {
				socketInterval: undefined
			}
		}),
		handlePingInterval: assign(({ context, self }) => {
			// Neither of these things should ever happen, but who knows?
			if (
				!context.socketInterval ||
				context.socket?.readyState !== WebSocket.OPEN
			)
				return {}

			if (context.dissatisfiedPings === 3) {
				// It's been ~5 seconds with no ping responses, so we can
				// consider the socket dead.
				self.send({ type: 'ws connection issue' })
				return {}
			}
			if (context.dissatisfiedPings === 1)
				self.send({ type: 'socket has destabilised' })

			// The ping message is `?`
			context.socket.send('?')

			return {
				dissatisfiedPings: context.dissatisfiedPings + 1
			}
		})
	}
}).createMachine({
	type: 'parallel',
	context: {
		dissatisfiedPings: 0
	},
	states: {
		websocket: {
			initial: 'disconnected',
			states: {
				disconnected: {
					entry: ['clearPingInterval', 'establishSocket'],
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
						},
						'socket ping time': {
							actions: ['handlePingInterval']
						},
						'ping received': {
							actions: ['acceptPing']
						}
					},
					initial: 'stable',
					states: {
						stable: {
							on: {
								'socket has destabilised': {
									target: 'unstable'
								}
							}
						},
						unstable: {
							on: {
								'socket has stabilised': {
									target: 'stable'
								}
							}
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
