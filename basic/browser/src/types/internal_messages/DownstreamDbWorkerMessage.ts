import type { drizzle } from 'drizzle-orm/sqlite-proxy'

export enum DownstreamDbWorkerMessageType {
	NotConnecting,
	Ready,
	SingleSuccessfulExecResult,
	SingleFailedExecResult,
	BatchSuccessfulExecResult,
	BatchFailedExecResult
}

export type DownstreamDbWorkerMessage =
	| {
			type:
				| DownstreamDbWorkerMessageType.NotConnecting
				| DownstreamDbWorkerMessageType.Ready
				| DownstreamDbWorkerMessageType.SingleFailedExecResult
				| DownstreamDbWorkerMessageType.BatchFailedExecResult
	  }
	| {
			type: DownstreamDbWorkerMessageType.SingleSuccessfulExecResult
			result: Awaited<ReturnType<Parameters<typeof drizzle>[0]>>
	  }
	| {
			type: DownstreamDbWorkerMessageType.BatchSuccessfulExecResult
			result: Awaited<ReturnType<NonNullable<Parameters<typeof drizzle>[1]>>>
	  }
