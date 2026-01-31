import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { loadEnv, type Plugin, type ViteDevServer } from 'vite'
import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import { getRequest } from '@sveltejs/kit/node'
import { WebSocketServer, type WebSocket as NodeWebSocket } from 'ws'

// --- Type Definitions ---

interface Asset {
	file: string
	type?: string
}

interface RouteParam {
	name: string
	matcher?: string
	optional: boolean
	rest: boolean
	chained: boolean
}

interface PageNode {
	depth: number
	component?: string
	universal?: string
	server?: string
}

interface RouteEndpoint {
	file: string
}

interface PageDefinition {
	layouts: (number | undefined)[]
	errors: (number | undefined)[]
	leaf: number
}

interface RouteData {
	id: string
	pattern: RegExp
	params: RouteParam[]
	page: PageDefinition | null
	endpoint: RouteEndpoint | null
}

interface ManifestData {
	assets: Asset[]
	nodes: PageNode[]
	routes: RouteData[]
	matchers: Record<string, string>
}

interface SvelteKitConfig {
	kit: {
		appDir: string
		outDir: string
		paths: {
			base: string
			assets: string
		}
		files: {
			routes: string
			params: string
			assets: string
			hooks: {
				client: string
				server: string
				universal: string
			}
		}
		env: {
			dir: string
		}
		moduleExtensions: string[]
		adapter?: {
			emulate?: () => Promise<Emulator>
		}
	}
}

interface Emulator {
	platform?: (details: {
		config: SvelteKitConfig
		prerender?: boolean
	}) => Promise<App.Platform>
}

interface SSRNode {
	index: number
	universal_id?: string
	server_id?: string
	component?: () => Promise<unknown>
	universal?: unknown
	server?: unknown
	imports: string[]
	stylesheets: string[]
	fonts: string[]
	inline_styles?: () => Promise<Record<string, string>>
}

interface SSRRoute {
	id: string
	pattern: RegExp
	params: RouteParam[]
	page: PageDefinition | null
	endpoint: (() => Promise<unknown>) | null
	endpoint_id?: string
}

interface SSRManifest {
	appDir: string
	appPath: string
	assets: Set<string>
	mimeTypes: Record<string, string>
	_: {
		client: {
			start: string
			app: string
			imports: string[]
			stylesheets: string[]
			fonts: string[]
			uses_env_dynamic_public: boolean
		}
		server_assets: Record<string, number>
		nodes: Array<() => Promise<SSRNode>>
		prerendered_routes: Set<string>
		remotes: Record<string, unknown>
		routes: SSRRoute[]
		matchers: () => Promise<Record<string, (param: string) => boolean>>
	}
}

interface CloudflareWebSocket {
	accept(): void
	send(data: string | ArrayBuffer): void
	close(code?: number, reason?: string): void
	addEventListener(
		type: 'message',
		listener: (event: { data: string | ArrayBuffer }) => void
	): void
	addEventListener(
		type: 'close',
		listener: (event: { code: number; reason: string }) => void
	): void
	addEventListener(type: 'error', listener: (event: unknown) => void): void
}

// Use intersection type to avoid extending Response (which has webSocket?: WebSocket | null)
type CloudflareWebSocketResponse = Response & {
	webSocket?: CloudflareWebSocket
}

// --- Utilities (inlined from SvelteKit internals) ---

function posixify(str: string): string {
	return str.replace(/\\/g, '/')
}

function toFs(str: string): string {
	str = posixify(str)
	return `/@fs${str.startsWith('/') ? '' : '/'}${str}`
}

function fromFs(str: string): string {
	str = posixify(str)
	if (!str.startsWith('/@fs')) return str
	str = str.slice(4)
	return str[2] === ':' && /[A-Z]/.test(str[1]) ? str.slice(1) : str
}

function compact<T>(arr: (T | null | undefined)[]): NonNullable<T>[] {
	return arr.filter((val): val is NonNullable<T> => val != null)
}

function getMimeLookup(manifestData: ManifestData): Record<string, string> {
	const mime: Record<string, string> = {}
	for (const asset of manifestData.assets) {
		if (asset.type) {
			mime[path.extname(asset.file)] = asset.type
		}
	}
	return mime
}

// --- SSR Manifest Construction ---

function buildSSRManifest(
	manifestData: ManifestData,
	config: SvelteKitConfig,
	vite: ViteDevServer,
	runtimeBase: string
): SSRManifest {
	const cwd = process.cwd()

	function resolveModuleUrl(id: string): string {
		return id.startsWith('..') ? toFs(path.posix.resolve(id)) : `/${id}`
	}

	return {
		appDir: config.kit.appDir,
		appPath: config.kit.appDir,
		assets: new Set(manifestData.assets.map((a) => a.file)),
		mimeTypes: getMimeLookup(manifestData),
		_: {
			client: {
				start: `${runtimeBase}/client/entry.js`,
				app: `${toFs(config.kit.outDir)}/generated/client/app.js`,
				imports: [],
				stylesheets: [],
				fonts: [],
				uses_env_dynamic_public: true
			},
			server_assets: new Proxy(
				{},
				{
					has: (_target, file: string) => {
						try {
							return fs.existsSync(fromFs(file))
						} catch {
							return false
						}
					},
					get: (_target, file: string) => {
						try {
							return fs.statSync(fromFs(file)).size
						} catch {
							return undefined
						}
					}
				}
			),
			nodes: manifestData.nodes.map((node, index) => {
				return async (): Promise<SSRNode> => {
					const result: SSRNode = {
						index,
						universal_id: node.universal,
						server_id: node.server,
						imports: [],
						stylesheets: [],
						fonts: []
					}

					if (node.component) {
						result.component = async () => {
							const url = resolveModuleUrl(node.component as string)
							const mod = await vite.ssrLoadModule(url, {
								fixStacktrace: true
							})
							return mod.default
						}
					}

					if (node.universal) {
						const url = resolveModuleUrl(node.universal)
						const mod = await vite.ssrLoadModule(url, {
							fixStacktrace: true
						})
						result.universal = mod
					}

					if (node.server) {
						const url = resolveModuleUrl(node.server)
						const mod = await vite.ssrLoadModule(url, {
							fixStacktrace: true
						})
						result.server = mod
					}

					result.inline_styles = async () => ({})
					return result
				}
			}),
			prerendered_routes: new Set(),
			remotes: {},
			routes: compact(
				manifestData.routes.map((route): SSRRoute | null => {
					if (!route.page && !route.endpoint) return null

					const endpoint = route.endpoint

					return {
						id: route.id,
						pattern: route.pattern,
						params: route.params,
						page: route.page,
						endpoint: endpoint
							? async () => {
									const url = path.resolve(cwd, endpoint.file)
									return await vite.ssrLoadModule(url, {
										fixStacktrace: true
									})
								}
							: null,
						endpoint_id: endpoint?.file
					}
				})
			),
			matchers: async () => {
				const matchers: Record<string, (param: string) => boolean> = {}
				for (const key in manifestData.matchers) {
					const file = manifestData.matchers[key]
					const url = path.resolve(cwd, file)
					const mod = await vite.ssrLoadModule(url, {
						fixStacktrace: true
					})
					if (mod.match) {
						matchers[key] = mod.match
					}
				}
				return matchers
			}
		}
	}
}

// --- File Watching ---

function setupManifestWatching(
	vite: ViteDevServer,
	config: SvelteKitConfig,
	onUpdate: () => void
): void {
	let timeout: ReturnType<typeof setTimeout> | null = null

	const debounce = (fn: () => void) => {
		if (timeout) clearTimeout(timeout)
		timeout = setTimeout(() => {
			timeout = null
			fn()
		}, 100)
	}

	const isWatched = (file: string): boolean => {
		return (
			file.startsWith(config.kit.files.routes + path.sep) ||
			file.startsWith(config.kit.files.params + path.sep) ||
			file.startsWith(config.kit.files.hooks.client) ||
			(config.kit.moduleExtensions || []).some((ext: string) =>
				file.endsWith(`.remote${ext}`)
			)
		)
	}

	vite.watcher.on('add', (file: string) => {
		if (isWatched(file)) debounce(onUpdate)
	})

	vite.watcher.on('unlink', (file: string) => {
		if (isWatched(file)) debounce(onUpdate)
	})
}

// --- WebSocket Upgrade Handler ---

interface UpgradeContext {
	getManifest: () => SSRManifest
	runtimeBase: string
	env: Record<string, string>
	emulator: Emulator | undefined
	verbose: boolean
}

function setupUpgradeHandler(
	vite: ViteDevServer,
	svelteConfig: SvelteKitConfig,
	ctx: UpgradeContext
): void {
	const httpServer = vite.httpServer
	if (!httpServer) return

	const log = (...args: unknown[]) => ctx.verbose && console.log(...args)
	const error = (...args: unknown[]) => ctx.verbose && console.error(...args)

	httpServer.on(
		'upgrade',
		async (req: IncomingMessage, _socket: Duplex, _head: Buffer) => {
			// Skip Vite's own HMR WebSocket upgrades
			const protocol = req.headers['sec-websocket-protocol']
			if (
				typeof protocol === 'string' &&
				protocol
					.split(',')
					.map((p) => p.trim())
					.includes('vite-hmr')
			) {
				return
			}

			log(`[sveltekit-ws] Intercepted upgrade request: ${req.url}`)

			try {
				const base = `${vite.config.server.https ? 'https' : 'http'}://${
					req.headers[':authority'] || req.headers.host
				}`

				// Convert Node.js IncomingMessage to Web API Request
				const request = await getRequest({ base, request: req })

				const manifest = ctx.getManifest()
				const url = new URL(request.url)

				// Find matching route
				const route = manifest._.routes.find((r) =>
					r.pattern.test(url.pathname)
				)
				if (!route || !route.endpoint) {
					error('[sveltekit-ws] No matching WebSocket endpoint found')
					return
				}

				// Load endpoint module directly via Vite SSR (bypasses SvelteKit response validation)
				const endpointModule = (await route.endpoint()) as {
					GET?: (event: unknown) => Promise<Response>
				}
				if (!endpointModule.GET) {
					error('[sveltekit-ws] Endpoint has no GET handler')
					return
				}

				// Get platform from emulator
				let platform: App.Platform | undefined
				if (ctx.emulator?.platform) {
					platform = await ctx.emulator.platform({
						config: svelteConfig,
						prerender: false
					})
				}

				// Call the endpoint directly, bypassing SvelteKit's response validation
				// This allows Miniflare's _Response (with webSocket property) to pass through
				const response = await endpointModule.GET({
					request,
					platform,
					url,
					params: {},
					locals: {},
					cookies: {
						get: () => undefined,
						getAll: () => [],
						set: () => {},
						delete: () => {},
						serialize: () => ''
					},
					getClientAddress: () => {
						const { remoteAddress } = req.socket
						if (remoteAddress) return remoteAddress
						throw new Error('Could not determine clientAddress')
					},
					isDataRequest: false,
					isSubRequest: false,
					fetch: globalThis.fetch,
					setHeaders: () => {},
					depends: () => {},
					untrack: (fn: () => unknown) => fn()
				})

				const cfResponse = response as CloudflareWebSocketResponse

				// Check if this is a WebSocket upgrade response
				if (cfResponse.status === 101 && cfResponse.webSocket) {
					log('[sveltekit-ws] Got WebSocket upgrade, establishing bridge...')

					const cfWebSocket = cfResponse.webSocket

					// Create a WebSocketServer to handle the Node.js side
					const wss = new WebSocketServer({ noServer: true })

					// Handle the upgrade using ws library
					wss.handleUpgrade(req, _socket, _head, (nodeWs: NodeWebSocket) => {
						log('[sveltekit-ws] Node.js WebSocket connected')

						// Accept the Cloudflare WebSocket
						cfWebSocket.accept()
						log('[sveltekit-ws] Cloudflare WebSocket accepted')

						// Bridge: Node.js client -> Cloudflare WebSocket
						nodeWs.on('message', (data: Buffer | string) => {
							try {
								const message =
									typeof data === 'string' ? data : data.toString()
								cfWebSocket.send(message)
							} catch (err) {
								error('[sveltekit-ws] Error forwarding to CF:', err)
							}
						})

						// Bridge: Cloudflare WebSocket -> Node.js client
						cfWebSocket.addEventListener('message', (event) => {
							try {
								if (nodeWs.readyState === nodeWs.OPEN) {
									nodeWs.send(event.data)
								}
							} catch (err) {
								error('[sveltekit-ws] Error forwarding to client:', err)
							}
						})

						// Handle close from Node.js client
						nodeWs.on('close', (code: number, reason: Buffer) => {
							log(`[sveltekit-ws] Node.js client closed: ${code}`)
							try {
								cfWebSocket.close(code, reason.toString())
							} catch {
								// Already closed
							}
						})

						// Handle close from Cloudflare WebSocket
						cfWebSocket.addEventListener('close', (event) => {
							log(`[sveltekit-ws] Cloudflare WebSocket closed: ${event.code}`)
							try {
								if (nodeWs.readyState === nodeWs.OPEN) {
									nodeWs.close(event.code, event.reason)
								}
							} catch {
								// Already closed
							}
						})

						// Handle errors
						nodeWs.on('error', (err: Error) => {
							error('[sveltekit-ws] Node.js WebSocket error:', err)
							try {
								cfWebSocket.close(1011, 'Internal error')
							} catch {
								// Already closed
							}
						})

						cfWebSocket.addEventListener('error', (event) => {
							error('[sveltekit-ws] Cloudflare WebSocket error:', event)
							try {
								nodeWs.close(1011, 'Internal error')
							} catch {
								// Already closed
							}
						})

						log('[sveltekit-ws] WebSocket bridge established')
					})
				} else {
					// Not a WebSocket upgrade, log error
					error('[sveltekit-ws] Expected WebSocket upgrade but got:', {
						status: cfResponse.status,
						hasWebSocket: 'webSocket' in cfResponse
					})
					_socket.destroy()
				}
			} catch (err) {
				error('[sveltekit-ws] WebSocket upgrade error:', err)
			}
		}
	)
}

// --- Main Plugin ---

export interface PluginOptions {
	verbose?: boolean
}

/**
 * Vite plugin that intercepts WebSocket upgrade requests and routes them
 * through SvelteKit's request handling pipeline, preserving the Response
 * object (including any `webSocket` property from Cloudflare-style handlers).
 */
export default function svelteKitWebSockets(
	options: PluginOptions = {}
): Plugin {
	const { verbose = false } = options

	return {
		name: 'sveltekit-websockets',

		async configureServer(vite) {
			const log = (...args: unknown[]) => verbose && console.log(...args)
			const warn = (...args: unknown[]) => verbose && console.warn(...args)
			const error = (...args: unknown[]) => verbose && console.error(...args)

			if (!vite.httpServer) {
				warn(
					'[sveltekit-ws] No HTTP server available, skipping WebSocket setup'
				)
				return
			}

			// Block WebSocket upgrade requests from going through SvelteKit's middleware
			vite.middlewares.use((req, _res, next) => {
				if (req.headers['upgrade']?.toLowerCase() === 'websocket') {
					// Don't call next() - the upgrade event handler will process this
					return
				}
				next()
			})

			// Resolve the @sveltejs/kit package root
			const _require = createRequire(import.meta.url)
			const kitRoot = path.dirname(
				_require.resolve('@sveltejs/kit/package.json')
			)

			// Dynamic import helper for SvelteKit internal modules
			const impKit = (subpath: string) =>
				import(pathToFileURL(path.join(kitRoot, subpath)).href)

			// Import internal SvelteKit modules
			const [configMod, createManifestDataMod] = await Promise.all([
				impKit('src/core/config/index.js'),
				impKit('src/core/sync/create_manifest_data/index.js')
			])

			const loadConfig = configMod.load_config as (opts?: {
				cwd?: string
			}) => Promise<SvelteKitConfig>
			const createManifestData = createManifestDataMod.default as (opts: {
				config: SvelteKitConfig
			}) => ManifestData

			// Compute the runtime base path
			const runtimeDir = posixify(path.join(kitRoot, 'src/runtime'))
			const runtimeBase = runtimeDir.startsWith(process.cwd())
				? `/${path.relative('.', runtimeDir)}`
				: toFs(runtimeDir)

			// Load the SvelteKit config
			const svelteConfig = await loadConfig()

			// Load environment variables
			const env = loadEnv(vite.config.mode, svelteConfig.kit.env.dir, '')

			// Try to get the adapter emulator
			let emulator: Emulator | undefined = undefined
			try {
				emulator = await svelteConfig.kit.adapter?.emulate?.()
			} catch (err) {
				warn('[sveltekit-ws] Adapter emulator not available:', err)
			}

			// Build the initial manifest
			let manifestData: ManifestData
			let manifest: SSRManifest

			const rebuildManifest = () => {
				manifestData = createManifestData({ config: svelteConfig })
				manifest = buildSSRManifest(
					manifestData,
					svelteConfig,
					vite,
					runtimeBase
				)
			}

			try {
				rebuildManifest()
				log('[sveltekit-ws] Initial manifest built')
			} catch (err) {
				error('[sveltekit-ws] Initial manifest error:', err)
			}

			// Watch for route file changes
			setupManifestWatching(vite, svelteConfig, () => {
				try {
					rebuildManifest()
					log('[sveltekit-ws] Manifest updated')
				} catch (err) {
					error('[sveltekit-ws] Manifest update error:', err)
				}
			})

			// Register the WebSocket upgrade handler
			setupUpgradeHandler(vite, svelteConfig, {
				getManifest: () => manifest,
				runtimeBase,
				env,
				emulator,
				verbose
			})

			log('[sveltekit-ws] WebSocket upgrade handler registered')
		}
	}
}
