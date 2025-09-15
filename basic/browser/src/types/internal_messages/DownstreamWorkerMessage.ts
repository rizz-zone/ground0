import type { Transformation } from '../memory_model/Tranformation'

export enum DownstreamWorkerMessageType {
	InitMemoryModel,
	Transformation
}

export type DownstreamWorkerMessage<MemoryModel extends object> =
	| {
			type: DownstreamWorkerMessageType.Transformation
			transformation: Transformation
	  }
	| {
			type: DownstreamWorkerMessageType.InitMemoryModel
			memoryModel: MemoryModel
	  }
