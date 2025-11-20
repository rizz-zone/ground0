/// <reference types="./testing/worker-configuration" />

import { DurableObject } from 'cloudflare:workers'
import {
	UpstreamWsMessageAction,
	type Transition,
	type SyncEngineDefinition,
	type UpstreamWsMessage,
	WsCloseCode,
	type BackendTransitionHandlers,
	TransitionImpact,
	type DownstreamWsMessage,
	DownstreamWsMessageAction,
	type UUID,
	type BackendHandlerParams,
	type Update,
	type TransitionSchema
} from '@ground0/shared'
import { isUpstreamWsMessage } from '@ground0/shared/zod'
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
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { EnhancedQueryLogger } from 'drizzle-query-logger'

function send(ws: WebSocket, json: DownstreamWsMessage) {
	if (ws.readyState === WebSocket.OPEN) ws.send(SuperJSON.stringify(json))
}

const connectionsTable = sqliteTable('__ground0_connections', {
	id: text().primaryKey().notNull()
})

export abstract class SyncEngineBackend<
	AppTransition extends Transition,
	AppUpdate extends Update
> extends DurableObject {
	// Handling and general definition
	/**
	 * The `SyncEngineDefinition` that is shared between the client and the
	 * server.
	 */
	protected abstract engineDef: SyncEngineDefinition<AppTransition, AppUpdate>
	/**
	 * The transition schema that transitions should be validated against.
	 */
	protected abstract appTransitionSchema: TransitionSchema<AppTransition>
	/**
	 * `BackendHandlers` for transitions that run code specific to the Durable
	 * Object.
	 */
	protected abstract backendHandlers: BackendTransitionHandlers<AppTransition>
	/**
	 * Functions to automatically run on certain events, like a ws connecting.
	 * This can be used in a similar way to autoTransitions on the client
	 * &mdash; for example, you can make an update that is always sent down to
	 * fresh clients.
	 */
	protected autoruns?: {
		onConnect?: ((ws: WebSocket) => unknown) | ((ws: WebSocket) => unknown)[]
	}

	// Configuration options
	protected readonly disconnectOnInvalidTransition: boolean = false
	protected readonly logInvalidTransitions: boolean = true
	protected readonly drizzleVerbose: boolean = false

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
	private initialisedSockets: UUID[] = []

	constructor(
		ctx: DurableObjectState,
		env: Env,
		options?: {
			/**
			 * Whether to disconnect when a client sends an invalid transition.
			 * @default false
			 */
			disconnectOnInvalidTransition?: boolean
			/**
			 * Whether to log transitions that do not match the app's transition schema.
			 * @default true
			 */
			logInvalidTransitions?: boolean
			/**
			 * Whether Drizzle should log debug messages, such as logging every query that is made.
			 * @default false
			 */
			drizzleVerbose?: boolean
		}
	) {
		super(ctx, env)
		if (options) Object.assign(this, options)
		this.db = drizzle(ctx.storage, {
			logger: this.drizzleVerbose ? new EnhancedQueryLogger() : false
		})

		// We need Istanbul to ignore this because it's hard to test
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
			;(await this.db.select().from(connectionsTable).values()).forEach(
				(entry) => {
					if (!entry[0] || typeof entry[0] !== 'string') return
					this.initialisedSockets.push(entry[0] as UUID)
				}
			)
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
		this.ctx.acceptWebSocket(server, [crypto.randomUUID()])

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

				// Get ID
				const id = this.ctx.getTags(ws)[0]
				if (!id) return ws.close(WsCloseCode.NoTagsApplied)

				if (this.autoruns && this.autoruns.onConnect)
					for (const fn of Array.isArray(this.autoruns.onConnect)
						? this.autoruns.onConnect
						: [this.autoruns.onConnect])
						try {
							await fn(ws)
						} catch (e) {
							console.error(e)
						}

				// We can now start sending events to this socket
				this.initialisedSockets.push(id as UUID)
				await this.db.insert(connectionsTable).values({ id }).run()

				break
			}
			case UpstreamWsMessageAction.Transition: {
				const data = decoded.data

				// Only allow the transition if it meets the consumer's schema
				const issues = (await this.appTransitionSchema.validate(data)).issues
				if (
					!((
						_: object,
						issues: ReadonlyArray<StandardSchemaV1.Issue> | undefined
					): _ is AppTransition =>
						typeof issues === 'undefined' || issues.length <= 0)(data, issues)
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
				await this.processTransition(data, decoded.id, ws)
			}
		}
	}

	private async processTransition(
		transition: AppTransition,
		transitionId: number,
		ws: WebSocket
	) {
		switch (transition.impact) {
			case TransitionImpact.OptimisticPush: {
				const handler =
					this.backendHandlers[
						transition.action as keyof BackendTransitionHandlers<AppTransition>
					]
				if (!handler) {
					console.error(`No handler found for action: ${transition.action}`)
					return
				}

				const confirmed = await handler.confirm({
					db: this.db as BackendHandlerParams<AppTransition>['db'],
					data: transition.data,
					rawSocket: ws,
					connectionId: 'not yet implemented', // TODO: Participate in IDs
					transitionId
				})
				send(ws, {
					action: confirmed
						? DownstreamWsMessageAction.OptimisticResolve
						: DownstreamWsMessageAction.OptimisticCancel,
					id: transitionId
				})
			}
		}
	}

	protected update(
		update: AppUpdate,
		opts?:
			| { target?: UUID | UUID[] }
			| { doNotTarget?: UUID | UUID[]; requireConnectionInitComplete?: boolean }
	) {
		const updateString = SuperJSON.stringify(update)
		for (const ws of this.ctx.getWebSockets()) {
			if (ws.readyState !== WebSocket.OPEN) continue
			const id = this.ctx.getTags(ws)[0] as UUID | undefined
			if (typeof id !== 'string') continue

			preScreening: if (opts) {
				if ('target' in opts && typeof opts.target !== 'undefined') {
					const { target } = opts
					if ((Array.isArray(target) ? target : [target]).includes(id))
						break preScreening
					continue
				}
				if ('doNotTarget' in opts && typeof opts.doNotTarget !== 'undefined') {
					const { doNotTarget } = opts
					if (
						(Array.isArray(doNotTarget) ? doNotTarget : [doNotTarget]).includes(
							id
						)
					)
						continue
				}
				if (
					'requireConnectionInitComplete' in opts &&
					typeof opts.requireConnectionInitComplete !== 'undefined' &&
					!this.initialisedSockets.includes(id)
				)
					continue
			}

			ws.send(updateString)
		}
	}
}
