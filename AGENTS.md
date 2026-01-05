# ground0

ground0 is an opinionated programmable sync layer for local-first reactive UI applications using Durable Objects as a backend. It is designed to be more granular than a regular 'reactive database', and provides developer control over how syncing works &mdash; it is intended to be more of a base than a complete solution.

## Monorepo

ground0 is a monorepo managed through pnpm workspaces and Turborepo.

- `basic/` contains the core ground0 code that will always be applicable regardless of the end-user's UI framework and preferences for how requests should be handled on the Cloudflare Worker.
- `adapters/` contains adapters for UI frameworks.
- `extras/` contains extras that are not directly related to ground0, but are either dependencies or helpful &mdash; for example, a Vite plugin to make SQL files importable as strings.
- `sample_integrations/` contains example applications built with ground0.

## Shared Concepts

ground0 is built around WebSockets. The client opens a connection to the Durable Object when the sync engine starts. Then, **transitions** and **updates** can start to be exchanged.

Transitions are initiated on the client. They represent a change that needs to be made to the memory model, local database, or the shared database.

Updates are initiated on the Durable Object, to send data to the client.

## Client

Because transitions can be made for different purposes, they have a `TransitionImpact`. This defines the rules that should be applied to make that transition happen. Internally, the `TransitionImpact` is used to select a _runner_ for the transition.

The client has a local database powered by SQLite WASM. This is intended to be used by the application for a local-first experience &mdash; it is not expected to be _durable_ or _reliable_, as the client of a web application will not always be connected and is not authoritative, but it helps to speed the application up overall.

It also has a memory model. This is a simple deeply reactive object that stores the application state. This integrates with the reactive framework that the application uses.

### Workers

The client uses workers for the sync and database work:

- The primary worker, which can be either a `SharedWorker` or a `Worker` (depending on browser support, because `SharedWorker` is not yet Baseline) and manages the WebSocket connection and the memory model. The memory model is shared between all tabs in the case that `SharedWorker` is available &mdash; tabs should manage their own state if it needs to be separate.
- The database worker, which is a `Worker` and manages the local database. This is because the APIs required for SQLite WASM without COEP/COOP are not available in `SharedWorker`s. The database will **only** be available if the browser has `SharedWorker` support, however, because it is otherwise difficult to ensure consistent and safe behaviour.

The database worker is produced from the main thread, and once a database worker is ready, it requests a lock. If it gets the lock, a `MessageChannel` for it is passed to the main thread, which relays to the `SharedWorker`.

## Durable Object

The Durable Object is the authoritative source of truth for the application state. ground0 only supports the SQLite storage backend for Durable Objects, meaning that the developer has a consistent interface for both client and global storage.

## Code standards

- Use TypeScript.
- Do not _avoid_ TypeScript strictness. `any`, `@ts-ignore`, etc should not be used ever. Only use `@ts-expect-error` with a justification beside the comment where necessary &mdash; this is most acceptable in test files, where we often want to access private properties/methods. Otherwise, if there is a _more type-safe_ solution, prefer it.
- 100% coverage is required for all code. Exclusions are allowed where justifiable.
