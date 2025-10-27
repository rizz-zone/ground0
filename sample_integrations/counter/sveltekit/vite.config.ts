import sqlRaw from 'vite-plugin-sql-raw'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [sveltekit(), sqlRaw()]
})
