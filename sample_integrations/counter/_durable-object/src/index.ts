import { SyncEngineBackend } from 'ground0/durable_object'
import {
	engineDef,
	TransitionAction,
	type AppTransition
} from '@ground0/sample-counter-shared'

export class SyncEngineDO extends SyncEngineBackend<AppTransition> {
	protected override engineDef = engineDef
	protected override backendHandlers = {
		[TransitionAction.Increment]: {
			confirm: () => Math.random() >= 0.5
		}
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
