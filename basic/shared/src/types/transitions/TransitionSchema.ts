import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Transition } from './Transition'

export type TransitionSchema<T extends Transition> = StandardSchemaV1.Props<T>
