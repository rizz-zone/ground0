<script lang="ts">
	import { engine } from "$lib/sync_engine"

	const { memoryModel } = engine

	$inspect($memoryModel)
</script>

<h1>Welcome to SvelteKit</h1>
<p>
	Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the
	documentation
</p>
<p>{$memoryModel}</p>
