import { type BackendTransitionHandlers, SyncEngineBackend } from 'ground0/durable_object'
import { type DurableObject } from 'cloudflare:workers'
import {
	dbSchema,
	engineDef,
	TransitionAction,
	type AppTransition
} from '@ground0/sample-counter-shared'
import { sql } from 'drizzle-orm'

export class SyncEngineDO extends SyncEngineBackend<AppTransition> {
	protected override engineDef = engineDef
	protected override backendHandlers = {
		[TransitionAction.Increment]: {
			confirm: async ({ db }) => {
				if (Math.random() >= 0.5) return false
				try {
					await db
						.insert(dbSchema.counter)
						.values({ id: 0, value: 1 })
						.onConflictDoUpdate({
							target: dbSchema.counter.id,
							set: { value: sql`${dbSchema.counter.value} + 1` }
						})
						.execute()
				} catch (e) {
					console.error('Error while incrementing:', e)
					return false
				}
				return true
			}
		}
	} satisfies BackendTransitionHandlers<AppTransition>

	constructor(...args: ConstructorParameters<typeof DurableObject>) {
		super(args[0], args[1] as Env, { drizzleVerbose: true })
	}
}

export default {
	async fetch(request, env, _ctx): Promise<Response> {
		if (new URL(request.url).pathname !== '/ws')
			return new Response(null, { status: 404 })
		const id = env.SYNC_ENGINE_DO.idFromName('counter')
		const stub = env.SYNC_ENGINE_DO.get(id)
		return stub.fetch(request)
	}
} satisfies ExportedHandler<Env>
