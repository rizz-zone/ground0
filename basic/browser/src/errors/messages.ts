import { INTERNAL_PROCESS, reportAt } from '@ground0/shared'

export const SHAREDWORKER_NO_PORTS = `A process connected ground0's SharedWorker, but it did not provide any ports. ${INTERNAL_PROCESS} ${reportAt('sharedworker_no_ports')}`
export const DB_DOWNLOAD = `There was an error while SQLite was being downloaded. ${reportAt('db_adapter_dl')}`
export const DB_INIT = `There was an error while the database was being initialised. ${INTERNAL_PROCESS} ${reportAt('db_setup')}`
export const DB_SIZE_PROBE = `Could not get database page size. ${INTERNAL_PROCESS} ${reportAt('probe_size')}`
export const DB_PAGE_COUNT_PROBE = `Could not get database page count. ${INTERNAL_PROCESS} ${reportAt('probe_count')}`
const dbMisbehaviour = (datapoint: string) =>
	`The database did not report a failure, but it did not return the page ${datapoint} either. ${INTERNAL_PROCESS} ${reportAt(`${datapoint}_probe_misbehaving`)}`
export const DB_SIZE_PROBE_MISBEHAVIOUR = dbMisbehaviour('size')
export const DB_COUNT_PROBE_MISBEHAVIOUR = dbMisbehaviour('count')
export const BROWSER_QUOTA = `Could not get browser storage quota. ${INTERNAL_PROCESS} ${reportAt('probe_quota')}`
export const DB_BEGIN_TRANSACTION = `Could not begin transaction for batched query. ${INTERNAL_PROCESS} ${reportAt('batch_start')}`
export const DB_ROLLBACK_TRANSACTION = `Tried to run transaction, failed, and could not rollback. ${INTERNAL_PROCESS} ${reportAt('batch_rb')}`
export const DB_COMMIT_TRANSACTION = `Could not commit transaction. ${INTERNAL_PROCESS} ${reportAt('batch_commit')}`
