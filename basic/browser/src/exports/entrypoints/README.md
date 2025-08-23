# Entrypoints

The project that includes this library needs to create a file for both a `SharedWorker` and a `Worker`. These entrypoints should reduce this to a 3-4 line declaration per file:

```ts
import { sharedWorkerEntrypoint } from 'ground0'
import { transitionHandler } from './handlers'

sharedWorkerEntrypoint(transitionHandler)
```

```ts
import { workerEntrypoint } from 'ground0'
import { transitionHandler } from './handlers'

workerEntrypoint(transitionHandler)
```

## Both entrypoints gatekeep the same thing

The only job of the entrypoint is to be a thin layer on top of the [`WorkerLocalFirst`](../../helpers/worker_thread.ts) class, which is itself a thin layer on top of a [`clientMachine`](../../machines/worker.ts). However, they have to perform slightly different tasks from each other:

| Function                           | `sharedWorkerEntrypoint` | `workerEntrypoint` |
| ---------------------------------- | ------------------------ | ------------------ |
| Accept messages from multiple tabs | ✅                       | ❌                 |
| Handle pings                       | ✅                       | ❌                 |
| Keep track of a leader tab         | ❌                       | ✅                 |

## Why not just export complete workers?

1. This wouldn't include transition handlers. Those can't simply be passed through from the main thread, they need to be included in the worker code itself
2. Despite workers being a standardised feature, the way build systems deal with them is not. Some won't allow for this kind of implementation to work well.

   In particular, Vite has this problem. You can use two types of syntax to import workers:

   ```ts
   import worker from './something?worker'
   ```

   ```ts
   const worker = new Worker(new URL('./something', import.meta.url), {
   	type: 'module'
   })
   ```

   The bottom syntax is strongly preferred in Vite (and is the only type of syntax that would allow us to prefer `SharedWorker` and fall back to `Worker` [when we need to on Android Chromium](https://caniuse.com/mdn-api_sharedworker)), but it cannot simply import an entrypoint from an NPM package.
