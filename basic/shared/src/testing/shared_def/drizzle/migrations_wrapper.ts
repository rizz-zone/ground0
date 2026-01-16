import type { GeneratedMigrationSchema } from '../../../types/defs/GeneratedMigrationSchema.js'
import migrationsJs from './migrations.js'

const migrations = migrationsJs as GeneratedMigrationSchema
export default migrations