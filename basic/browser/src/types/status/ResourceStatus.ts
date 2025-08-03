import type { DbResourceStatus } from './DbResourceStatus'
import type { WsResourceStatus } from './WsResourceStatus'

export type ResourceStatus = {
	db: DbResourceStatus
	ws: WsResourceStatus
}
