export enum UpstreamWorkerMessageType {
	Transition,
	Close
}

export type UpstreamWorkerMessage<T> =
	| {
			type: UpstreamWorkerMessageType.Transition
			data: T
	  }
	| { type: UpstreamWorkerMessageType.Close }
