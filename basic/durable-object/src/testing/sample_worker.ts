/* istanbul ignore file -- @preserve */

export { SampleObject } from './sample_object'
export default {
	async fetch() {
		return new Response()
	}
} satisfies ExportedHandler
