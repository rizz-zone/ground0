import type { DbResourceStatus } from './DbResourceStatus'
import type { WsResourceStatus } from './WsResourceStatus'

/**
 * @deprecated A `ResourceBundle` is preferable in new code because it connects
 * a status with actual available resources, which TypeScript is more fond of.
 */
export type ResourceStatus = {
	db: DbResourceStatus
	ws: WsResourceStatus
}
