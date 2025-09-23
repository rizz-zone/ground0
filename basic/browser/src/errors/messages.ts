import { INTERNAL_PROCESS, reportAt } from '@ground0/shared'

export const SHAREDWORKER_NO_PORTS = `A process connected ground0's SharedWorker, but it did not provide any ports. ${INTERNAL_PROCESS} ${reportAt('sharedworker_no_ports')}`
export const DB_DOWNLOAD_ERROR = `There was an error while SQLite was being downloaded. ${reportAt('db_adapter_dl')}`
export const DB_INIT_ERROR = `There was an error while the database was being initialised. ${INTERNAL_PROCESS} ${reportAt('db_setup')}`
