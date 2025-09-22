import type { ResourceBundle } from '@/types/status/ResourceBundle'
import { WsResourceStatus } from '@/types/status/WsResourceStatus'
import {
	UpstreamWsMessageAction,
	WsCloseCode,
	type UpstreamWsMessage
} from '@ground0/shared'
import SuperJSON from 'superjson'

export async function connectWs({
	wsUrl,
	currentVersion,
	syncResources,
	handleMessage
}: {
	wsUrl: string
	currentVersion: string
	syncResources: (modifications: Partial<ResourceBundle>) => void
	handleMessage: (message: MessageEvent<string | ArrayBuffer | Blob>) => unknown
}) {
	let reconnectCooldown: Promise<void> = Promise.resolve()
	let currentConnectionId = -1
	function connectAnew() {
		currentConnectionId++
		syncResources({ ws: { status: WsResourceStatus.Disconnected } })
		const ourConnectionId = currentConnectionId
		return (async () => {
			await reconnectCooldown
			// Worth checking because we're doing a lot of async/await. It
			// probably won't be necessary though, so it's not tested
			if (ourConnectionId !== currentConnectionId) /* v8 ignore next */ return
			reconnectCooldown = new Promise((resolve) => setTimeout(resolve, 500))

			const ws = new WebSocket(wsUrl)
			let dissatisfiedPings = 0

			ws.onopen = () => {
				if (ourConnectionId !== currentConnectionId) {
					ws.close(WsCloseCode.SocketAppearsObsolete)
					return
				}
				ws.send(
					SuperJSON.stringify({
						action: UpstreamWsMessageAction.Init,
						version: currentVersion
					} satisfies UpstreamWsMessage)
				)
				syncResources({
					ws: { status: WsResourceStatus.Connected, instance: ws }
				})

				// Ping interval
				{
					let interval: ReturnType<typeof setInterval> | undefined =
						setInterval(() => {
							if (ourConnectionId !== currentConnectionId) {
								if (interval) {
									clearInterval(interval)
									interval = undefined
								}
								return
							}
							if (dissatisfiedPings > 3) {
								ws.close(WsCloseCode.Timeout)
								return
							}
							ws.send('?')
							dissatisfiedPings++
						}, 5000 / 3)
				}
			}
			ws.onmessage = (message) => {
				if (ourConnectionId !== currentConnectionId) return

				// Handle pong messages first
				if (message.data === '!') {
					dissatisfiedPings--
					return
				}

				// Let WorkerLocalFirst handle literally anything else
				handleMessage(message)
			}
			ws.onerror = () => {
				if (ourConnectionId !== currentConnectionId) return
				ws.close(WsCloseCode.Error)
			}
			ws.onclose = () => {
				if (ourConnectionId !== currentConnectionId) return
				// TODO: Handle NoTagsApplied, Incompatible, and InvalidMessage
				// in a more helpful way
				connectAnew()
			}
		})()
	}

	connectAnew()
}
