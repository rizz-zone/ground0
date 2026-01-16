export enum UpstreamWorkerMessageType {
	Transition,
	Close,
	DebugLog,
	DbWorkerPrepared
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
	| {
			type: UpstreamWorkerMessageType.DbWorkerPrepared
			port: MessagePort
	  }
