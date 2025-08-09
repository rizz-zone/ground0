export enum UpstreamWorkerMessageType {
	Init,
	Transition,
	Ping
}

export type UpstreamWorkerMessage<T> =
	| {
			type: UpstreamWorkerMessageType.Init
			data: { dbName: string; wsUrl: string }
	  }
	| {
			type: UpstreamWorkerMessageType.Transition
			data: T
	  }
	| { type: UpstreamWorkerMessageType.Ping }
