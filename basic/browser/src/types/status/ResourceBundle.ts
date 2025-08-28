import type { LocalDatabase } from '@ground0/shared'
import type { DbResourceStatus } from './DbResourceStatus'
import type { WsResourceStatus } from './WsResourceStatus'

export type ResourceBundle = {
	ws:
		| {
				readonly status: WsResourceStatus.Disconnected
		  }
		| {
				readonly status: WsResourceStatus.Connected
				readonly instance: WebSocket
		  }
	db:
		| {
				readonly status:
					| DbResourceStatus.Disconnected
					| DbResourceStatus.NeverConnecting
		  }
		| {
				readonly status: DbResourceStatus.ConnectedAndMigrated
				readonly instance: LocalDatabase
		  }
}
