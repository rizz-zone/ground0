/* v8 ignore start */

const INTERNAL_PROCESS =
	'This is a process that happens internally, so this is probably a problem with ground0, not your code.'
// @__PURE__
const reportAt = (reportSnake: string) =>
	`Report at https://ground0.rizz.zone/report/${reportSnake}`

// @__PURE__
const createInitString = (item: string, reportSnake: string) =>
	`${item} was initialized twice! ${INTERNAL_PROCESS} ${reportAt(reportSnake)}`

export const TEST_ONLY = `Testing function run outside of Vitest. ${INTERNAL_PROCESS} ${reportAt('test_only_fn_used')}`
export const MAP_DESTRUCTOR_INCONSISTENCY = `Port manager assumed a port existed, but it was not present. ${INTERNAL_PROCESS} ${reportAt('static_map_inconsistent')}`
export const WORKER_MACHINE_RUNNING_WITHOUT_PROPER_INIT = `The worker state machine is running post-init code, but seems to lack data provided during init. ${INTERNAL_PROCESS} ${reportAt('worker_machine_improper_init')}`
export const DOUBLE_SHAREDWORKER_PORT_INIT = createInitString(
	'SharedWorker port',
	'sw_double_init'
)
export const OPTIMISTIC_PUSH_NOT_EVALUATED = `An OptimisticPush transition was informed about a resource change, but the need for it was not evaluated at the time of construction. ${INTERNAL_PROCESS} ${reportAt('database_not_evaluated')}`
export const OPTIMISTIC_PUSH_IN_USE_BEFORE_DATBASE_STATE_FINALISED = `An OptimisticPush transition was given a database init event after the database had already started being used. ${INTERNAL_PROCESS} ${reportAt('database_init_after_used')}`

// @__PURE__
export const workerDoubleInit = (shared: boolean) =>
	`${shared ? 'Shared' : ''}Worker entrypoint called twice. To resolve this:
- Only call ${shared ? 'sharedW' : 'w'}orkerEntrypoint() once throughout the lifecycle of the worker
- Do not run any other code inside of your worker.`
// @__PURE__
export const handlerThrew = (handlerName: string, promiseRejection: boolean) =>
	`Handler ${handlerName} ${promiseRejection ? 'returned a promise that was rejected' : 'threw an error'}! If it is reversible, the reverse method will not be called.`
// @__PURE__
export const improperResourceChangeEvent = (resource: 'ws' | 'db') =>
	`on${resource.charAt(0).toUpperCase() + resource.slice(1)}Connected fired, but the ${resource} connection was not actually available. ${INTERNAL_PROCESS} ${reportAt('incomplete_handler_resource_change')}`
