import {
	discriminatedUnion,
	extend,
	literal,
	object,
	refine,
	string,
	union,
	gte
} from 'zod/mini'
import { UpstreamWsMessageAction } from '../../types/ws/UpstreamWsMessageAction'
import semverValid from 'semver/functions/valid.js'
import { TransitionSchema } from '../transitions/Transition'
import { TransitionImpact } from '../../types/transitions/TransitionImpact'
import { int } from 'zod'
import type { UpstreamWsMessage } from '@/types/ws/UpstreamWsMessage'

export const UpstreamWsMessageSchema = discriminatedUnion('action', [
	object({
		action: literal(UpstreamWsMessageAction.Init),
		version: string().check(refine(semverValid))
	}),
	object({
		action: literal(UpstreamWsMessageAction.Transition),
		id: int().check(gte(0)),
		data: extend(TransitionSchema, {
			impact: union([
				literal(TransitionImpact.OptimisticPush),
				literal(TransitionImpact.UnreliableWsOnlyNudge),
				literal(TransitionImpact.WsOnlyNudge)
			])
		})
	})
])
export const isUpstreamWsMessage = (obj: unknown): obj is UpstreamWsMessage =>
	UpstreamWsMessageSchema.safeParse(obj).success
