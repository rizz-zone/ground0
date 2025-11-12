/// <reference types="bun-types" />

import sqlRaw from 'vite-plugin-sql-raw'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import devtoolsJson from 'vite-plugin-devtools-json'
import 'dotenv/config'

// In dev mode, the `define` property does not work (at least for workers,
// which is where this is relevant to us), so we have to use this workaround
// in order to allow for an import from $env/static/public to be made:
// https://github.com/sveltejs/kit/pull/10542#issuecomment-2433702711
//
// For prod, we have to instead mark $env/static/public as external because,
// while it is not actually imported in the worker, it is referenced inside of
// an import call (that should not normally be hit). Fun.
const dev = process.argv.includes('dev')
export default defineConfig({
	plugins: [sveltekit(), sqlRaw(), devtoolsJson()],
	worker: {
		// and this is still lies
		plugins: () => [...(dev ? [sveltekit()] : []), sqlRaw()],
		format: 'es',
		rollupOptions: dev ? undefined : { external: ['$env/static/public'] }
	},
	define: {
		__WS_URL__: `'${process.env.PUBLIC_WS_URL as string}'`
	}
})
