import {
	type BackendTransitionHandlers,
	type BackendAutoruns,
	SyncEngineBackend
} from 'ground0/durable_object'
import { type DurableObject } from 'cloudflare:workers'
import {
	dbSchema,
	engineDef,
	TransitionAction,
	UpdateAction,
	type AppTransition,
	type AppUpdate
} from '@ground0/sample-counter-shared'
import { appTransitionSchema } from '@ground0/sample-counter-shared/schema'
import { eq, sql } from 'drizzle-orm'
import { UpdateImpact } from 'ground0'

export class SyncEngineDO extends SyncEngineBackend<AppTransition, AppUpdate> {
	protected override engineDef = engineDef
	protected override appTransitionSchema = appTransitionSchema

	private currentCount = 0

	protected override autoruns = {
		onConnect: async (id) => {
			this.update(
				{
					action: UpdateAction.InitialValue,
					impact: UpdateImpact.Unreliable,
					data: { value: this.currentCount }
				},
				{ target: id }
			)
		}
	} satisfies BackendAutoruns
	protected override backendHandlers = {
		[TransitionAction.Increment]: {
			confirm: async ({ db, connectionId }) => {
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
					this.currentCount++
				} catch (e) {
					console.error('Error while incrementing:', e)
					return false
				}
				this.update(
					{ action: UpdateAction.Increment, impact: UpdateImpact.Unreliable },
					{ doNotTarget: connectionId }
				)
				return true
			}
		}
	} satisfies BackendTransitionHandlers<AppTransition>

	constructor(...args: ConstructorParameters<typeof DurableObject>) {
		super(args[0], args[1] as Env, { drizzleVerbose: true })
		this.ctx.blockConcurrencyWhile(async () => {
			const result = await this.db
				.select({ value: dbSchema.counter.value })
				.from(dbSchema.counter)
				.where(eq(dbSchema.counter.id, 0))
				.limit(1)
				.get()
			if (!result) return
			this.currentCount = result.value
		})
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
