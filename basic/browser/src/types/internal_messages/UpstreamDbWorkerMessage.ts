import type { drizzle } from 'drizzle-orm/sqlite-proxy'

export enum UpstreamDbWorkerMessageType {
	Init,
	ExecOne,
	ExecBatch
}

export type UpstreamDbWorkerMessage =
	| {
			type: UpstreamDbWorkerMessageType.ExecOne
			params: Parameters<Parameters<typeof drizzle>[0]>
	  }
	| {
			type: UpstreamDbWorkerMessageType.ExecBatch
			params: Parameters<NonNullable<Parameters<typeof drizzle>[1]>>
	  }
