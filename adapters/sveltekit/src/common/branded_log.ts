/**
 * Log with a **`[@ground0/adapter-svelte]`** prefix to ensure the source is clear.
 * @param functionToUse The logging function to use, like `console.debug` or `console.warn`.
 * @param args The arguments you would pass to that function.
 */
export function brandedLog(
	functionToUse:
		| typeof console.debug
		| typeof console.log
		| typeof console.warn
		| typeof console.error
		| typeof console.info
		| typeof console.trace,
	...args: Parameters<typeof console.debug>
) {
	functionToUse('%c[@ground0/adapter-svelte]', 'font-weight:bold', ...args)
}
