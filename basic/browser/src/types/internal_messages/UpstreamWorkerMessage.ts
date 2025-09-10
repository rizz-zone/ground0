export enum UpstreamWorkerMessageType {
	Transition
}

export type UpstreamWorkerMessage<T> = {
	type: UpstreamWorkerMessageType.Transition
	data: T
}
