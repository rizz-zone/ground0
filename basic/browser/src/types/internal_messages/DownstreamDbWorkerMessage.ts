export enum DownstreamDbWorkerMessageType {
	NotConnecting
}

export type DownstreamDbWorkerMessage = {
	type: DownstreamDbWorkerMessageType.NotConnecting
}
