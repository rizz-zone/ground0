import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Update } from './Update'

export type UpdateSchema<T extends Update> = StandardSchemaV1.Props<T>
