import { describe, it, expect, vi } from 'vitest'
import { brandedLog } from './branded_log'

describe('brandedLog', () => {
	it('calls the provided function with the brand and arguments', () => {
		const mockLog = vi.fn()
		brandedLog(mockLog as typeof console.log, 'test message', { foo: 'bar' })

		expect(mockLog).toHaveBeenCalledWith(
			'%c[@ground0/adapter-svelte]',
			'font-weight:bold',
			'test message',
			{ foo: 'bar' }
		)
	})

	it('works with different console methods', () => {
		const consoleMethods = ['log', 'warn', 'error', 'info', 'debug'] as const

		for (const method of consoleMethods) {
			const mockFn = vi.fn()
			const msg = `message for ${method}`
			brandedLog(mockFn, msg)
			expect(mockFn).toHaveBeenCalledWith(
				'%c[@ground0/adapter-svelte]',
				'font-weight:bold',
				msg
			)
		}
	})
})
