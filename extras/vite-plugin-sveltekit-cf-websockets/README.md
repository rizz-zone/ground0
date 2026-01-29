# vite-plugin-sveltekit-cf-websockets

> [!CAUTION]
> This plugin was written fully by Claude Code. Expect that it might break or
> behave in unexpected ways if you have an unusual SvelteKit setup, or if your
> routes do something that it did not predict, or if today is a Tuesday.
>
> This is not at all helped by the fact that the plugin touches SvelteKit
> internals. It can equally break because of an update to SvelteKit.

A Vite plugin to fix WebSocket upgrades in the dev server with SvelteKit when
targeting Cloudflare Workers. Made to be used with
[ground0](https://github.com/rizz-zone/ground0), but you may find that it works
well enough for other use cases as well.

## Usage

Simply add the plugin to your Vite config.

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import svelteKitWebSockets from 'vite-plugin-sveltekit-cf-websockets'

export default defineConfig({
	plugins: [svelteKitWebSockets(), sveltekit()]
})
```

You can pass a `verbose` option to the plugin to get more detailed logging.

```ts
import { sveltekit } from '@sveltejs/kit/vite'
import svelteKitWebSockets from 'vite-plugin-sveltekit-cf-websockets'

export default defineConfig({
	plugins: [svelteKitWebSockets({ verbose: true }), sveltekit()]
})
```
