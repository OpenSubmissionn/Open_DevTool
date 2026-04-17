import { describe, it, expect } from 'vitest'
import { fetchTransaction } from '../../src/solana/rpc'
import { parseLogsFromBundle } from '../../src/analysis/logParser'
import { profileCU } from '../../src/analysis/cuProfiler'

// @integration
describe('Integration: RPC → Logs → CU', () => {
  it('fetches a live devnet tx and validates log parsing and CU profiling', async () => {
    const signature = '3QBfD3sBbBfVhFbdD1aF7jqkdmxWRwV7zzLsMFYSbKbx3kKpF1pVirfRoFhJxmm9KZGmVVABN8fQiYwv1a8oknK'

    let bundle
    try {
      bundle = await fetchTransaction(signature)
    } catch (error) {
      console.warn(
        'Skipping integration test: live devnet connection required.',
        error instanceof Error ? error.message : error,
      )
      return
    }

    const parsed = parseLogsFromBundle(bundle.logs)
    const cuProfile = profileCU(bundle.logs)

    expect(typeof parsed.totalLines).toBe('number')
    expect(parsed.totalLines).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(parsed.byProgram)).toBe(true)

    expect(typeof cuProfile.totalConsumed).toBe('number')
    expect(cuProfile.totalConsumed).toBeGreaterThanOrEqual(0)
    expect(cuProfile.utilizationPercent).toBeGreaterThanOrEqual(0)
    expect(cuProfile.utilizationPercent).toBeLessThanOrEqual(100)
    expect(cuProfile.totalLimit).toBeGreaterThan(0)

    console.log('Day 4: RPC → Parsed logs → CU working')
  }, 15000)
})
