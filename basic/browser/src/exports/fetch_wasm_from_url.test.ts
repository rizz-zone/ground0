import { it, expect, vi, beforeEach, describe } from 'vitest'
import { fetchWasmFromUrl } from './fetch_wasm_from_url'
import { DownloadFailedError } from '@/errors'
import { DOWNLOAD_FAILED } from '@/errors/messages'
import { brandedLog } from '@/common/branded_log'

vi.mock('@/common/branded_log', () => ({
	brandedLog: vi.fn()
}))

describe('fetchWasmFromUrl', () => {
	const url = 'https://example.com/db.wasm'
	const mockBuffer = new ArrayBuffer(8)

	beforeEach(() => {
		vi.resetAllMocks()
		vi.stubGlobal('fetch', vi.fn())
		vi.spyOn(performance, 'now').mockReturnValue(0)
	})

	it('returns a function that fetches and returns an ArrayBuffer', async () => {
		const fetchMock = vi.mocked(fetch)
		fetchMock.mockResolvedValue({
			arrayBuffer: async () => mockBuffer
		} as Response)

		const fetcher = fetchWasmFromUrl(url)
		const result = await fetcher()

		expect(fetchMock).toHaveBeenCalledWith(url)
		expect(result).toBe(mockBuffer)
	})

	it('retries when fetch fails', async () => {
		const fetchMock = vi.mocked(fetch)
		const performanceMock = vi.mocked(performance.now)

		// First call fails, second succeeds
		fetchMock
			.mockRejectedValueOnce(new Error('Network error'))
			.mockResolvedValueOnce({
				arrayBuffer: async () => mockBuffer
			} as Response)

		// Time doesn't advance past 30s
		performanceMock.mockReturnValueOnce(0).mockReturnValueOnce(1000)

		const fetcher = fetchWasmFromUrl(url)
		const result = await fetcher()

		expect(fetchMock).toHaveBeenCalledTimes(2)
		expect(result).toBe(mockBuffer)
		expect(brandedLog).toHaveBeenCalledWith(
			console.error,
			'Failed to fetch db wasm:',
			expect.any(Error),
			'\n\nRetrying if less than 30s have passed...'
		)
	})

	it('throws DownloadFailedError if fetch keeps failing for more than 30 seconds', async () => {
		const fetchMock = vi.mocked(fetch)
		const error = new Error('Persistent network error')
		fetchMock.mockRejectedValue(error)

		const fetcher = fetchWasmFromUrl(url)

		// We need to advance time inside the loop.
		// Since we can't easily do that without knowing when it's called,
		// we can make the mock increment time on each call.
		let callCount = 0
		vi.spyOn(performance, 'now').mockImplementation(() => {
			if (callCount === 0) {
				callCount++
				return 0 // startedTryingAt
			}
			return 31000 // condition check
		})

		await expect(fetcher()).rejects.toThrow(DownloadFailedError)

		// Reset for next check
		callCount = 0
		await expect(fetcher()).rejects.toThrow(DOWNLOAD_FAILED)

		// Reset and check cause
		callCount = 0
		try {
			await fetcher()
		} catch (e) {
			expect(e).toBeInstanceOf(DownloadFailedError)
			expect((e as DownloadFailedError).cause).toBe(error)
		}
	})

	it('passes all fetch parameters to the fetch call', async () => {
		const fetchMock = vi.mocked(fetch)
		fetchMock.mockResolvedValue({
			arrayBuffer: async () => mockBuffer
		} as Response)

		const options: RequestInit = {
			method: 'POST',
			headers: { 'X-Test': 'true' }
		}
		const fetcher = fetchWasmFromUrl(url, options)
		await fetcher()

		expect(fetchMock).toHaveBeenCalledWith(url, options)
	})
})
