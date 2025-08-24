import { createMemoryModel } from '@/helpers/memory_model'
import { runners } from '@/runners/all'
import { TransitionRunner } from '@/runners/base'
import type { Transformation } from '@/types/memory_model/Tranformation'
import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import {
	DownstreamWsMessageAction,
	InternalStateError,
	isDownstreamWsMessage,
	TransitionImpact,
	UpstreamWsMessageAction,
	WORKER_MACHINE_RUNNING_WITHOUT_PROPER_INIT,
	type DownstreamWsMessage,
	type LocalDatabase,
	type LocalHandlers,
	type SyncEngineDefinition,
	type Transition,
	type UpstreamWsMessage
} from '@ground0/shared'
import SuperJSON from 'superjson'
import { assign, setup, type ActorRefFrom, type SnapshotFrom } from 'xstate'

function generateResourceStatus(snapshot: SnapshotFrom<typeof clientMachine>) {
	return {
		db: snapshot.matches({ db: 'disconnected' })
			? DbResourceStatus.Disconnected
			: snapshot.matches({ db: 'connected' })
				? DbResourceStatus.ConnectedAndMigrated
				: DbResourceStatus.NeverConnecting,
		ws: snapshot.matches({ websocket: 'connected' })
			? WsResourceStatus.Connected
			: WsResourceStatus.Disconnected
	}
}

export const clientMachine = setup({
	types: {
		context: {} as {
			socket?: WebSocket
			db?: LocalDatabase
			wsUrl?: string
			socketInterval?: ReturnType<typeof setInterval>
			dbName?: string
			engineDef?: SyncEngineDefinition<Transition>
			dissatisfiedPings: number
			localHandlers?: LocalHandlers<object, Transition>
			nextTransitionId: number
			transitions: Map<number, TransitionRunner<object, TransitionImpact>>
			memoryModel?: object
		},
		events: {} as
			| {
					type: 'init'
					wsUrl: string
					dbName: string
					engineDef: SyncEngineDefinition<Transition>
					localHandlers: LocalHandlers<object, Transition>
					initialMemoryModel: object
					announceTransformation: (transformation: Transformation) => unknown
			  }
			| { type: 'ws connected' }
			| { type: 'ws connection issue' }
			| { type: 'db connected' }
			| { type: 'db cannot connect' }
			| { type: 'socket ping time' }
			| { type: 'ping received' }
			| { type: 'socket has destabilised' }
			| { type: 'socket has stabilised' }
			| { type: 'transition'; transition: Transition }
			| { type: 'transition complete'; id: number }
			| { type: 'incoming ws message'; payload: DownstreamWsMessage }
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
				// The pong message is `!`
				if (event.data === '!') return self.send({ type: 'ping received' })

				// Attempt to decode as a downstream message
				let decoded
				try {
					decoded = SuperJSON.parse(event.data)
				} catch {
					console.error("well that's bad") // TODO: Handle this situation Correctly
					return
				}
				if (!isDownstreamWsMessage(decoded)) {
					console.error("well that's also bad") // TODO: Also handle this situation Correctly
					return
				}

				// Handle it!
				self.send({ type: 'incoming ws message', payload: decoded })
			}
			return { socket }
		}),
		handleWsMessage: assign(({ event, context }) => {
			if (
				event.type !== 'incoming ws message' ||
				!context.socket ||
				context.socket?.readyState == WebSocket.OPEN
			)
				return {}

			const { payload } = event
			switch (payload.action) {
				case DownstreamWsMessageAction.OptimisticResolve:
				case DownstreamWsMessageAction.OptimisticCancel:
					console.error('not implemented') // TODO: implement this when optimistic transitions get registered
					return {}
				default:
					console.warn('No matched case') // TODO: Proper message
					return {}
			}
		}),
		establishDb: assign(() => ({})),
		initMemoryModel: assign(({ event }) => {
			if (event.type !== 'init') /* v8 ignore next */ return {}
			return {
				memoryModel: createMemoryModel(
					event.initialMemoryModel,
					event.announceTransformation
				)
			}
		}),
		initWsUrl: assign(({ event }) => {
			if (event.type !== 'init') /* v8 ignore next */ return {}
			return { wsUrl: event.wsUrl }
		}),
		initDbName: assign(({ event }) => {
			if (event.type !== 'init') /* v8 ignore next */ return {}
			return { dbName: event.dbName }
		}),
		initEngineDef: assign(({ event }) => {
			if (event.type !== 'init') /* v8 ignore next */ return {}
			return { engineDef: event.engineDef }
		}),
		initLocalHandlers: assign(({ event }) => {
			if (event.type !== 'init') /* v8 ignore next */ return {}
			return { localHandlers: event.localHandlers }
		}),
		wsInitMessage: ({ context }) => {
			const { socket, engineDef } = context
			if (!engineDef)
				throw new InternalStateError(WORKER_MACHINE_RUNNING_WITHOUT_PROPER_INIT)
			if (!socket || socket.readyState !== WebSocket.OPEN) return
			socket.send(
				SuperJSON.stringify({
					action: UpstreamWsMessageAction.Init,
					version: engineDef.version.current
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
		acceptPing: assign(({ context, self }) => {
			const { dissatisfiedPings } = context
			if (dissatisfiedPings === 2) self.send({ type: 'socket has stabilised' })
			return {
				dissatisfiedPings: dissatisfiedPings - 1
			}
		}),
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
		}),
		screenTransition: assign(({ event, self, context }) => {
			if (event.type !== 'transition') /* v8 ignore next */ return {}
			if (!context.memoryModel || !context.localHandlers)
				throw new InternalStateError(WORKER_MACHINE_RUNNING_WITHOUT_PROPER_INIT)

			const snapshot = self.getSnapshot() as SnapshotFrom<typeof clientMachine>

			context.transitions.set(
				context.nextTransitionId,
				new runners[event.transition.impact]({
					actorRef: self as ActorRefFrom<typeof clientMachine>,
					initialResources: {
						ws: context.socket,
						db: context.db
					},
					memoryModel: context.memoryModel,
					resourceStatus: generateResourceStatus(snapshot),
					id: context.nextTransitionId,
					// @ts-expect-error TS can't narrow the type down as narrowly as it wants to, and there's no convenient way to make it
					transition: event.transition,
					// @ts-expect-error TS can't narrow the type down as narrowly as it wants to, and there's no convenient way to make it
					localHandler: context.localHandlers[event.transition.action]
				})
			)

			return {
				nextTransitionId: context.nextTransitionId + 1
			}
		}),
		updateTransitionResources: ({ self, context }) => {
			const snapshot = self.getSnapshot() as SnapshotFrom<typeof clientMachine>
			// Don't waste time looping through when the machine starts
			if (snapshot.matches({ init: 'incomplete' })) return

			for (const runner of context.transitions.values()) {
				runner.syncResources(
					{
						ws: context.socket,
						db: context.db
					},
					generateResourceStatus(snapshot)
				)
			}
		}
	}
}).createMachine({
	type: 'parallel',
	context: {
		dissatisfiedPings: 0,
		nextTransitionId: 0,
		transitions: new Map()
	},
	on: {
		transition: {
			actions: ['screenTransition']
		},
		init: {
			actions: ['initMemoryModel']
		}
	},
	states: {
		init: {
			initial: 'incomplete',
			states: {
				incomplete: {
					on: {
						init: {
							target: 'complete'
						}
					}
				},
				complete: {
					type: 'final'
				}
			}
		},
		websocket: {
			initial: 'disconnected',
			states: {
				disconnected: {
					entry: [
						'clearPingInterval',
						'establishSocket',
						'updateTransitionResources'
					],
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
					entry: [
						'wsInitMessage',
						'createPingInterval',
						'updateTransitionResources'
					],
					on: {
						'ws connection issue': {
							target: 'disconnected'
						},
						'socket ping time': {
							actions: ['handlePingInterval']
						},
						'ping received': {
							actions: ['acceptPing']
						},
						'incoming ws message': {
							actions: ['handleWsMessage']
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
			// Only a SharedWorker is allowed a db. This minimally breaks
			// xstate's expectations, but we don't do this kind of hack
			// elsewhere (and it keeps us from loading wasm we'll never use)
			initial: 'onconnect' in self ? 'disconnected' : 'will never connect',
			on: {
				init: {
					actions: ['initDbName']
				}
			},
			states: {
				disconnected: {
					entry: ['updateTransitionResources'],
					on: {
						'db connected': {
							target: 'connected'
						},
						'db cannot connect': {
							target: 'will never connect'
						}
					}
				},
				'will never connect': {
					entry: ['updateTransitionResources'],
					type: 'final'
				},
				connected: {
					entry: ['updateTransitionResources'],
					type: 'final'
				}
			}
		}
	}
})
