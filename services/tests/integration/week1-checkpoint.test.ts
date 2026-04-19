import { describe, it, expect } from 'vitest'
import { fetchTransaction } from '../../src/solana/rpc'
import { parseTransaction } from '../../src/analysis/txParser'
import { profileCU } from '../../src/analysis/cuProfiler'

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

    // Adaptado para o seu txParser real
    const parsed = parseTransaction(bundle)
    
    // Pegando os logs do lugar correto dentro do bundle
    const logs = bundle.rawResponse?.meta?.logMessages || []
    const cuProfile = profileCU(logs)

    // Validações do ParsedTransaction
    expect(parsed.signature).toBe(signature)
    expect(typeof parsed.success).toBe('boolean')
    expect(Array.isArray(parsed.instructions)).toBe(true)

    // Validações do CU Profiler
    expect(typeof cuProfile.totalConsumed).toBe('number')
    expect(cuProfile.totalConsumed).toBeGreaterThanOrEqual(0)
    expect(cuProfile.utilizationPercent).toBeGreaterThanOrEqual(0)
    expect(cuProfile.utilizationPercent).toBeLessThanOrEqual(100)

    console.log('Day 4: RPC → Parsed logs → CU working')
  }, 15000)
})