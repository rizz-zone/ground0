import { describe, expect, it } from 'vitest'
import { SampleObject } from './testing/sample_object'

describe('constructor', () => {
	it('assigns this.db', () => {
		const backend = new SampleObject()
	})
})
