import { DurableObject } from 'cloudflare:workers'
import {
	UpstreamWsMessageAction,
	type Transition,
	type SyncEngineDefinition,
	isUpstreamWsMessage,
	type UpstreamWsMessage,
	WsCloseCode,
	type BackendHandlers,
	TransitionImpact,
	type UUID
} from '@ground0/shared'
import SuperJSON from 'superjson'
import semverMajor from 'semver/functions/major'
import semverMinor from 'semver/functions/minor'
import {
	drizzle,
	type DrizzleSqliteDODatabase
} from 'drizzle-orm/durable-sqlite'
import { migrate } from 'drizzle-orm/durable-sqlite/migrator'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { sql } from 'drizzle-orm'

export abstract class SyncEngineBackend<
	T extends Transition
> extends DurableObject {
	// Handling and general definition
	/**
	 * The `SyncEngineDefinition` that is shared between the client and the server.
	 */
	protected abstract engineDef: SyncEngineDefinition<T>
	/**
	 * `BackendHandlers` for transitions that run code specific to the Durable Object.
	 */
	protected abstract backendHandlers: BackendHandlers<T>

	// Configuration options
	protected readonly disconnectOnInvalidTransition: boolean = false
	protected readonly logInvalidTransitions: boolean = true

	/**
	 * A function to:
	 *
	 * 1. Check whether a request should be allowed, on the worker invoked by the request
	 * 2. If the request should be allowed, provide the ID of the Durable Object instance that should be created or used.
	 *
	 * By default, `preCheckFetch` acts based off the `engine_name` query param. If it is not set, it returns `400 Bad Request`, and if it is, it returns the value of this param (which means that that the specific instance of the Durable Object used will have that ID).`
	 *
	 * @param request The request that comes into the Worker
	 * @returns A string for the ID of the Durable Object instance if the request is allowed to continue, or a response if it is rejected
	 */
	public static preCheckFetch: (request: Request) => string | Response = (
		request
	) => {
		const engineName = new URL(request.url).searchParams.get('engine_name')
		if (!engineName)
			return new Response(
				'Request does not contain engine_name param. Did you forget to override preCheckFetch? https://ground0.rizz.zone/something', // TODO: Fill this URL when the docs are made
				{ status: 400 }
			)
		return engineName
	}
	/**
	 * An optional function to check a request *on the Durable Object instance*. Generally, you should avoid this and override `preCheckFetch` instead, as this shortens response time for requests that fail as well as ensuring that you do not get billed for storage. However, you might need it if part of your criteria for whether a request should be rejected is based off something you store inside of the Durable Object's database.
	 *
	 * In most apps, you should only set this if `preCheckFetch` is already set, as `preCheckFetch` also decides on the ID of the Durable Object instance, and the default behaviour of always creating an instance with the same ID as the `engine_name` query parameter is usually undesirable.
	 *
	 * @returns A `Response` if the request should be blocked and not allowed to upgrade to a websocket, or `undefined` if the request can continue.
	 */
	protected checkFetch?: (request: Request) => Response | undefined

	protected db: DrizzleSqliteDODatabase<Record<string, unknown>>

	constructor(ctx: DurableObjectState, env: object) {
		super(ctx, env)
		this.db = drizzle(ctx.storage, { logger: false })

		// We need Itanbul to ignore this because it's hard to test
		// constructors, and we test that this works by ensuring that a pair is
		// set after the fact, not by mocking `ctx`. It is largely irrelevant
		// whether we call setWebSocketAutoResponse when there's already a pair
		// set, but it's very relevant whether one is set in the first place,
		// and we check for the worst case in testing.

		/* istanbul ignore if -- @preserve */
		if (!this.ctx.getWebSocketAutoResponse())
			this.ctx.setWebSocketAutoResponse(
				new WebSocketRequestResponsePair('?', '!')
			)

		ctx.blockConcurrencyWhile(async () => {
			await migrate(this.db, this.engineDef.db.migrations)
			await this.db.run(sql`
				CREATE TABLE IF NOT EXISTS ${sql.identifier('__ground0_connections')} (
				  id STRING PRIMARY KEY NOT NULL
				)`)
		})
	}

	override async fetch(request: Request) {
		{
			const upgradeHeader = request.headers.get('Upgrade')
			const connectionHeader = request.headers.get('Connection')

			if (
				!connectionHeader ||
				connectionHeader.toLowerCase() !== 'upgrade' ||
				!upgradeHeader ||
				!upgradeHeader.split(' ').includes('websocket')
			)
				return new Response('Upgrade Required', { status: 426 })
		}

		if (this.checkFetch) {
			const potentialResponse = this.checkFetch(request)
			if (potentialResponse) return potentialResponse
		}

		// Create two ends of a WebSocket connection
		const webSocketPair = new WebSocketPair()
		const [client, server] = Object.values(webSocketPair)
		if (!client || !server) return new Response(null, { status: 500 })

		// Accept the server one
		this.ctx.acceptWebSocket(server)

		return new Response(null, {
			status: 101,
			webSocket: client
		})
	}

	override async webSocketMessage(
		ws: WebSocket,
		message: string | ArrayBuffer
	) {
		if (typeof message !== 'string') {
			console.log('Client sent an ArrayBuffer!')
			return ws.close(WsCloseCode.InvalidMessage)
		}
		let decoded: UpstreamWsMessage
		try {
			const potentialObj = SuperJSON.parse(message)
			if (!isUpstreamWsMessage(potentialObj)) throw new Error()
			decoded = potentialObj
		} catch {
			console.log('Client did not send valid JSON!')
			return ws.close(WsCloseCode.InvalidMessage)
		}

		switch (decoded.action) {
			case UpstreamWsMessageAction.Init: {
				// Close the connection if:
				// - The major version is mismatched
				// - The major version is 0 and the minor version is
				//   mismatched, as minor is treated as major on 0.x.x versions
				if (
					semverMajor(decoded.version) !==
						semverMajor(this.engineDef.version.current) ||
					(semverMajor(this.engineDef.version.current) === 0 &&
						semverMinor(this.engineDef.version.current) !==
							semverMinor(decoded.version))
				)
					return ws.close(WsCloseCode.Incompatible)
				break
			}
			case UpstreamWsMessageAction.Transition: {
				const data = decoded.data

				// Only allow the transition if it meets the consumer's schema
				const issues = (await this.engineDef.transitions.schema.validate(data))
					.issues
				if (
					!((
						data: object,
						issues: ReadonlyArray<StandardSchemaV1.Issue> | undefined
					): data is T => Boolean(issues))(data, issues)
				) {
					if (this.logInvalidTransitions) {
						console.error('Invalid transition sent:\n', data)
						console.error('\nIssues:')
						for (const issue in issues) console.error(' - ' + issue)
						console.error()
					}
					if (this.disconnectOnInvalidTransition)
						ws.close(WsCloseCode.InvalidMessage)
					return
				}

				// Do the right thing depending on impact
				await this.processTransition(data, decoded.id as UUID, ws)
			}
		}
	}

	private async processTransition(
		transition: T,
		transitionId: UUID,
		responsibleSocket: WebSocket
	) {
		switch (transition.impact) {
			case TransitionImpact.OptimisticPush: {
				const handler =
					this.backendHandlers[transition.action as keyof BackendHandlers<T>]
				if (!handler) {
					console.error(`No handler found for action: ${transition.action}`)
					return
				}

				const confirmed = await handler.confirm({
					data: transition.data,
					rawSocket: responsibleSocket,
					connectionId: 'not yet implemented', // TODO: Participate in IDs
					transition: (_: Transition) => undefined,
					transitionId
				})
				return confirmed
			}
		}
	}
}
