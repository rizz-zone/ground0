import type { UUID } from '@ground0/shared'

export type BackendAutoruns = {
	/**
	 * Functions to run when the ws connects. **Until all functions have
	 * finished running, the socket will not be marked as initialised.**
	 *
	 * This is primarily suitable for initialising a new client with
	 * dynamic data that depends on the shared state of the application.
	 *
	 * @param id The UUID of the new ws
	 * @example
	 * ```ts
	 * autoruns = {
	 * 	onConnect: (id) => {
	 * 		this.update({
	 * 			action: 'init',
	 * 			impact: UpdateImpact.Unreliable,
	 * 			data: this.state
	 * 		}, { target: id })
	 * 	}
	 * }
	 */
	onConnect?:
		| ((connectionId: UUID) => unknown)
		| ((connectionId: UUID) => unknown)[]
}
