export enum UpstreamWorkerMessageType {
	Transition,
	Close,
	DebugLog
}

export type UpstreamWorkerMessage<T> =
	| {
			type: UpstreamWorkerMessageType.Transition
			data: T
	  }
	| {
			type: UpstreamWorkerMessageType.Close
	  }
	| {
			type: UpstreamWorkerMessageType.DebugLog
			message: string
	  }
