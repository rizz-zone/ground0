export class ResourceInitError extends Error {
	constructor(...input: ConstructorParameters<typeof Error>) {
		super(...input)
		this.name = 'ResourceInitError'

		Object.setPrototypeOf(this, ResourceInitError.prototype)
	}
}
export class SizeProbeError extends Error {
	constructor(...input: ConstructorParameters<typeof Error>) {
		super(...input)
		this.name = 'SizeProbeError'

		Object.setPrototypeOf(this, SizeProbeError.prototype)
	}
}
export class DbQueryBatchingError extends Error {
	constructor(...input: ConstructorParameters<typeof Error>) {
		super(...input)
		this.name = 'DbQueryBatchingError'

		Object.setPrototypeOf(this, DbQueryBatchingError.prototype)
	}
}
export class DbQueryError extends Error {
	constructor(...input: ConstructorParameters<typeof Error>) {
		super(...input)
		this.name = 'DbQueryError'

		Object.setPrototypeOf(this, DbQueryError.prototype)
	}
}
export class LocalQueryExecutionError extends Error {
	constructor(...input: ConstructorParameters<typeof Error>) {
		super(...input)
		this.name = 'LocalQueryExecutionError'

		Object.setPrototypeOf(this, LocalQueryExecutionError.prototype)
	}
}
export class DownloadFailedError extends Error {
	constructor(...input: ConstructorParameters<typeof Error>) {
		super(...input)
		this.name = 'DownloadFailedError'

		Object.setPrototypeOf(this, DownloadFailedError.prototype)
	}
}
