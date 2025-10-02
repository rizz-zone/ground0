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
