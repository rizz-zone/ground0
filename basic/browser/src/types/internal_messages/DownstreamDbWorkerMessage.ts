export enum DownstreamDbWorkerMessageType {
	NotConnecting,
	Ready
}

export type DownstreamDbWorkerMessage = {
	type:
		| DownstreamDbWorkerMessageType.NotConnecting
		| DownstreamDbWorkerMessageType.Ready
}
