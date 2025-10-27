<script lang="ts">
	import type { AppTransition, MemoryModel } from '$lib/sync_engine/types'
	import { createSyncEngine } from '@ground0/adapter-svelte'

	const engine = createSyncEngine<AppTransition, MemoryModel>(
		new URL('$lib/sync_engine/entrypoint.ts', import.meta.url)
	)
	const { memoryModel } = engine
</script>

<h1>Welcome to SvelteKit</h1>
<p>
	Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the
	documentation
</p>
<p>{$memoryModel}</p>
