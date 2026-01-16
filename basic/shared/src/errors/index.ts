/* v8 ignore start */

export class NoPortsError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'NoPortsError'

		Object.setPrototypeOf(this, NoPortsError.prototype)
	}
}
export class PortDoubleInitError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'DoublePortInitError'

		Object.setPrototypeOf(this, PortDoubleInitError.prototype)
	}
}
export class WorkerDoubleInitError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'WorkerDoubleInitError'

		Object.setPrototypeOf(this, WorkerDoubleInitError.prototype)
	}
}
export class TestOnlyError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'TestOnlyError'

		Object.setPrototypeOf(this, TestOnlyError.prototype)
	}
}
export class AbsentPortDisconnectionError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'AbsentPortDisconnectionError'

		Object.setPrototypeOf(this, AbsentPortDisconnectionError.prototype)
	}
}
export class InternalStateError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'InternalStateError'

		Object.setPrototypeOf(this, InternalStateError.prototype)
	}
}
export class EndOfTheUniverseError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'EndOfTheUniverseError'

		Object.setPrototypeOf(this, EndOfTheUniverseError.prototype)
	}
}
export class ImproperResourceChangeEventError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'ImproperResourceChangeEventError'

		Object.setPrototypeOf(this, ImproperResourceChangeEventError.prototype)
	}
}
