import { expect, it } from 'vitest'
import { createSyncEngine as originalCreateSyncEngine } from '@/exports/create_sync_engine'
import { createSyncEngine as reExportCreateSyncEngine } from '.'

it('re-exports createSyncEngine', () => {
	expect(originalCreateSyncEngine).toBe(reExportCreateSyncEngine)
})
