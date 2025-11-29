import { DbResourceStatus } from '@/types/status/DbResourceStatus'
import type { ResourceBundle } from '@/types/status/ResourceBundle'
import type { LocalDatabase } from '@ground0/shared'
import { migrations } from '@ground0/shared/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { DbThinClient } = await import('./index')

const syncResources = vi.fn()
const inputs = {
	syncResources,
	migrations,
	dbName: 'kevin'
} as const as ConstructorParameters<typeof DbThinClient>[0]

beforeEach(vi.clearAllMocks)

describe('constructor', () => {
	it('sets this.migrations to provided migrations', () => {
		const client = new DbThinClient(inputs)
		// @ts-expect-error For this test, we want to access the private member
		expect(client.migrations).toBe(migrations)
	})
	it('sets this.dbName to provided dbName', () => {
		const client = new DbThinClient(inputs)
		// @ts-expect-error For this test, we want to access the private member
		expect(client.dbName).toBe(inputs.dbName)
	})
	it('sets this.syncDbResource to method that calls syncResources and sets this.status', () => {
		const client = new DbThinClient(inputs)
		// @ts-expect-error We are testing the private method
		const { syncDbResource } = client
		expect(syncResources).not.toHaveBeenCalled()
		// @ts-expect-error We are testing with the private value
		expect(client.status).toBe(DbResourceStatus.Disconnected)
		for (const [index, syncValue] of Object.entries([
			{
				status: DbResourceStatus.ConnectedAndMigrated,
				instance: {} as LocalDatabase
			},
			{ status: DbResourceStatus.NeverConnecting }
		] satisfies ResourceBundle['db'][])) {
			syncDbResource(syncValue)
			expect(syncResources).toHaveBeenNthCalledWith(Number(index) + 1, {
				db: syncValue
			} satisfies Partial<ResourceBundle>)
			// @ts-expect-error We are testing with the private value
			expect(client.status).toBe(syncValue.status)
		}
	})
})
