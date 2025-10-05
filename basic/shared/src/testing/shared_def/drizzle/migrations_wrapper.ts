import type { GeneratedMigrationSchema } from '../../../types/transitions/handling/GeneratedMigrationSchema'
// Import the JS module and assert its type for TS consumers
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import migrationsJs from './migrations.js'

const migrations = migrationsJs as GeneratedMigrationSchema
export default migrations