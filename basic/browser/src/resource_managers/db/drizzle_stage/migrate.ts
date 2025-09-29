import type { GeneratedMigrationSchema } from '@ground0/shared'
import { sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'

export async function migrate(
	db: SqliteRemoteDatabase<Record<string, unknown>>,
	localMigrations: GeneratedMigrationSchema
) {
	// TODO: More specific errors

	const migrationsTable = '__drizzle_migrations'
	await db.run(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      hash TEXT NOT NULL,
      created_at numeric
    )`)
	const dbMigrations = await db.values<[number, string, string]>(
		sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`
	)

	for (const entry of localMigrations.journal.entries) {
		if (
			typeof dbMigrations[0] !== 'undefined' &&
			entry.when <= Number(dbMigrations[0][2])
		) {
			console.debug(
				'Skipping migration',
				entry.idx,
				'because it is already applied'
			)
			continue
		}
		console.debug('Attempting to apply', entry.idx)

		// Get the migration. Drizzle migrations are 4 digits long
		const migrationMemberName: `m${string}` = `m${(entry.tag as string).split('_')[0]}`
		if (
			!(migrationMemberName in localMigrations.migrations) ||
			typeof localMigrations.migrations[migrationMemberName] === 'undefined'
		)
			throw new Error(
				`${migrationMemberName} does not exist, but the journal suggested it should exist: ${entry}`
			)

		// Process the raw migration string
		const rawMigrationFile: string =
			localMigrations.migrations[migrationMemberName]
		const individualCommands = [
			...rawMigrationFile
				.split(';')
				.map((basicString) => db.run(sql.raw(basicString))),
			db.run(
				sql`INSERT INTO ${sql.identifier(migrationsTable)} ("hash", "created_at") VALUES(${sql.raw(
					`'${Array.from(
						new Uint8Array(
							await crypto.subtle.digest(
								'SHA-256',
								new TextEncoder().encode(rawMigrationFile)
							)
						)
					)
						.map((b) => b.toString(16).padStart(2, '0'))
						.join('')}'`
				)}, ${sql.raw(entry.when.toString())})`
			)
		]

		// Do it
		console.debug(individualCommands)
		await db.batch(
			individualCommands as unknown as readonly [
				BatchItem<'sqlite'>,
				...BatchItem<'sqlite'>[]
			]
		)
	}
}
