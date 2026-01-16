import { describe, expect, it } from 'vitest'
import {
	ResourceInitError,
	SizeProbeError,
	DbQueryBatchingError,
	DbQueryError,
	LocalQueryExecutionError,
	DownloadFailedError
} from '.'

describe('error classes', () => {
	const errorCases = [
		{ ErrorClass: ResourceInitError, name: 'ResourceInitError' },
		{ ErrorClass: DbQueryError, name: 'DbQueryError' },
		{ ErrorClass: LocalQueryExecutionError, name: 'LocalQueryExecutionError' }
	] as const

	for (const { ErrorClass, name } of errorCases) {
		describe(name, () => {
			it('has correct name', () => {
				const error = new ErrorClass('test message')
				expect(error.name).toBe(name)
			})
			it('preserves message', () => {
				const error = new ErrorClass('test message')
				expect(error.message).toBe('test message')
			})
			it('is instanceof Error', () => {
				const error = new ErrorClass('test message')
				expect(error).toBeInstanceOf(Error)
			})
			it('is instanceof itself', () => {
				const error = new ErrorClass('test message')
				expect(error).toBeInstanceOf(ErrorClass)
			})
			it('has correct prototype chain', () => {
				const error = new ErrorClass('test message')
				expect(Object.getPrototypeOf(error)).toBe(ErrorClass.prototype)
			})
			it('accepts error options', () => {
				const cause = new Error('cause')
				const error = new ErrorClass('test message', { cause })
				expect(error.cause).toBe(cause)
			})
		})
	}

	it('SizeProbeError is correctly defined', () => {
		const error = new SizeProbeError('test')
		expect(error.name).toBe('SizeProbeError')
		expect(error.message).toBe('test')
	})

	it('DbQueryBatchingError is correctly defined', () => {
		const error = new DbQueryBatchingError('test')
		expect(error.name).toBe('DbQueryBatchingError')
		expect(error.message).toBe('test')
	})

	it('DownloadFailedError is correctly defined', () => {
		const error = new DownloadFailedError('test')
		expect(error.name).toBe('DownloadFailedError')
		expect(error.message).toBe('test')
	})
})
