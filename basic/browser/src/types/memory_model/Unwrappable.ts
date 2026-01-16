import type { unwrap } from '@/helpers/memory_model'

export type Unwrappable<T extends object> = {
	[unwrap]: () => { [key: PropertyKey]: unknown }
} & T
