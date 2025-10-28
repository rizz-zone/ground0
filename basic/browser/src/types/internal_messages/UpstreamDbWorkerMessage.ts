export enum UpstreamDbWorkerMessageType {
	Init
}

export type UpstreamDbWorkerMessage = {
	type: UpstreamDbWorkerMessageType.Init
	buffer: ArrayBuffer
	dbName: string
}
