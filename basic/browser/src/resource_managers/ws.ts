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
		syncResources({ ws: { status: WsResourceStatus.Disconnected } })
		currentConnectionId++
		const ourConnectionId = currentConnectionId
		return (async () => {
			await reconnectCooldown
			// Worth checking because we're doing a lot of async/await
			if (ourConnectionId !== currentConnectionId) return
			reconnectCooldown = new Promise((resolve) => setTimeout(resolve, 500))

			const ws = new WebSocket(wsUrl)
			let dissatisfiedPings = 0

			function reconnect(code?: WsCloseCode) {
				if (ourConnectionId !== currentConnectionId) return
				connectAnew()
				ws.close(code)
			}

			ws.onopen = () => {
				if (ourConnectionId !== currentConnectionId) {
					ws.close()
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
							if (dissatisfiedPings <= 3) return reconnect(WsCloseCode.Timeout)
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
			ws.onerror = () => reconnect(WsCloseCode.Error)
			ws.onclose = () => {
				if (ourConnectionId !== currentConnectionId) return
				connectAnew()
			}
		})()
	}

	connectAnew()
}
