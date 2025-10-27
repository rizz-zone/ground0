import { brandedLog } from '@/common/branded_log'
import { DownloadFailedError } from '@/errors'
import { DOWNLOAD_FAILED } from '@/errors/messages'

export function fetchWasmFromUrl(
	...params: Parameters<typeof fetch>
): () => Promise<ArrayBuffer> {
	return async () => {
		const startedTryingAt = performance.now()
		let lastError: unknown

		do {
			try {
				return await (await fetch(...params)).arrayBuffer()
			} catch (e) {
				if (e instanceof Error) lastError = e
				brandedLog(
					console.error,
					'Failed to fetch db wasm:',
					e,
					'\n\nRetrying if less than 30s have passed...'
				)
			}
		} while (startedTryingAt + 30 * 1000 > performance.now())

		throw new DownloadFailedError(DOWNLOAD_FAILED, { cause: lastError })
	}
}
