import type { getProperty } from 'dot-prop'

export type ArbitraryPath = Parameters<typeof getProperty>[1]
