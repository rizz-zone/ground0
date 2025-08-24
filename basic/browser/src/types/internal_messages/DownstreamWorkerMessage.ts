import type { Transformation } from '../memory_model/Tranformation'

export enum DownstreamWorkerMessageType {
	Transformation
}

export type DownstreamWorkerMessage = {
	type: DownstreamWorkerMessageType.Transformation
	transformation: Transformation
}
