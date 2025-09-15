import { INTERNAL_PROCESS, reportAt } from '@ground0/shared'

export const SHAREDWORKER_NO_PORTS = `A process connected ground0's SharedWorker, but it did not provide any ports. ${INTERNAL_PROCESS} ${reportAt('sharedworker_no_ports')}`
