import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { Transition } from '@/types/transitions/Transition'
import type { TransitionSchema } from '../types/transitions/TransitionSchema'

/**
 * Creates a `TransitionSchema` that can be used in a sync engine definition.
 * @param schema A schema from any [Standard Schema compatible validation library](https://standardschema.dev/#what-schema-libraries-implement-the-spec) (Zod, Arktype, Valibot, Effect Schema, etc) defining either one specific transition or a union of transitions.
 * @returns {TransitionSchema} A `TransitionSchema` to use in your engine definition.
 */
export function createTransitionSchema<T extends Transition>(
	schema: StandardSchemaV1<T>
): TransitionSchema<T> {
	return schema['~standard'] as TransitionSchema<T>
}
