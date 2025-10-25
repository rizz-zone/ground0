<script lang="ts">
    import { createSyncEngine } from '@ground0/adapter-svelte'

    createSyncEngine(new URL('http://localhost:5173/c.js'))
</script>

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
