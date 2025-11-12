/// <reference types="bun-types" />

import sqlRaw from 'vite-plugin-sql-raw'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import devtoolsJson from 'vite-plugin-devtools-json'
import 'dotenv/config'

export default defineConfig({
	plugins: [sveltekit(), sqlRaw(), devtoolsJson()],
	worker: {
		plugins: () => [sqlRaw()],
	},
	define: {
		__WS_URL__: `'${process.env.PUBLIC_WS_URL as string}'`
	}
})
