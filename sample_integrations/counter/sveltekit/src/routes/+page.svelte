<script lang="ts">
	import { engine } from "$lib/sync_engine"

	const { memoryModel, path } = engine
	const derivedMemoryModel = $derived.by(() => {
		try {
			return JSON.stringify($memoryModel)
		} catch {
			return $memoryModel
		}
	})

	// const pathStore = path('counter')

	$inspect($memoryModel)
</script>

<h1>Welcome to SvelteKit</h1>
<p>
	Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the
	documentation
</p>
<code>{derivedMemoryModel}</code>
<!--<code>{$pathStore}</code>-->