import type { LocalDatabase } from '@ground0/shared'
import type { DbResourceStatus } from './DbResourceStatus'
import type { WsResourceStatus } from './WsResourceStatus'

export type ResourceBundle = {
	ws:
		| {
				status: WsResourceStatus.Disconnected
				resource?: WebSocket
		  }
		| {
				status: WsResourceStatus.Connected
				resource: WebSocket
		  }
	db:
		| {
				status: DbResourceStatus.Disconnected | DbResourceStatus.NeverConnecting
		  }
		| {
				status: DbResourceStatus.ConnectedAndMigrated
				resource: LocalDatabase
		  }
}
