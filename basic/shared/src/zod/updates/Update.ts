import {
	union,
	object,
	string,
	optional,
	enum as zEnum,
	looseObject,
	int
} from 'zod/mini'
import { UpdateImpact } from '@/types/updates/UpdateImpact'
import type { Update } from '@/types/updates/Update'

// Slightly unusual naming for this repo, but required because of
// TransitionSchema.ts which is more relevant to consumers (this is, in
// comparison, really only important for internal Durable Object code)
export const UpdateSchema = object({
	action: union([string(), int()]),
	impact: zEnum(UpdateImpact),
	data: optional(looseObject({}))
})
export const isUpdate = (obj: unknown): obj is Update =>
	UpdateSchema.safeParse(obj).success
