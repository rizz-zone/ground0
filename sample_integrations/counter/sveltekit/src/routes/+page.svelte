<script lang="ts">
    import { createSyncEngine } from '@ground0/adapter-svelte'

    const engine = createSyncEngine(new URL('$lib/worker_index.ts', import.meta.url))
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
