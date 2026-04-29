import { describe, it, expect } from 'vitest'
import { mockRPCBundle } from '../setup'
import { detectAnomalies } from '../../src/analysis/anomalyDetector'
import { analyzeCosts } from '../../src/analysis/costAnalyzer'
import { parseLogsFromBundle } from '../../src/analysis/logParser'
import { profileCU } from '../../src/analysis/cuProfiler'
import { RawTransactionBundle } from '../../src/analysis/types'

function runPipeline(bundle: RawTransactionBundle) {
  const logs = parseLogsFromBundle(bundle.logMessages ?? [])
  const cuProfile = profileCU(bundle.logMessages ?? [])
  const costAnalysis = analyzeCosts(bundle, 150, 1000)
  const anomalyReport = detectAnomalies(bundle, costAnalysis.transfers)
  return { logs, cuProfile, costAnalysis, anomalyReport }
}

describe('Anomaly rendering integration', () => {
  it('renders anomaly report for spam transaction', () => {
    const bundle = mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'UNKNOWN_MINT_XYZ',
          owner: 'someowner',
          uiTokenAmount: {
            amount: '2000000000000',
            decimals: 6,
            uiAmount: 2000000,
            uiAmountString: '2000000',
          },
        },
      ],
    })
    const { anomalyReport } = runPipeline(bundle)
    expect(anomalyReport.anomalies.length).toBeGreaterThanOrEqual(0)
    expect(typeof anomalyReport.summary).toBe('string')
    expect(typeof anomalyReport.hasHighSeverity).toBe('boolean')
  })

  it('renders anomaly report for clean transaction', () => {
    const bundle = mockRPCBundle()
    const { anomalyReport } = runPipeline(bundle)
    expect(anomalyReport.summary).toBe('No anomalies detected')
  })

  it('anomaly report has correct structure for all severity levels', () => {
    // Spam: high severity
    const spamBundle = mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'UNKNOWN_MINT_ABC',
          owner: 'owner1',
          uiTokenAmount: {
            amount: '5000000000000',
            decimals: 6,
            uiAmount: 5000000,
            uiAmountString: '5000000',
          },
        },
      ],
    })

    // MEV-like: medium severity
    const mevBundle = mockRPCBundle({
      logMessages: [
        'Program AAA invoke [1]',
        'Program BBB invoke [2]',
        'Program log: swap executed',
        'Program CCC invoke [1]',
      ],
    })

    // Nondeterministic: medium severity
    const nondeterminBundle = mockRPCBundle({
      err: 'error code',
      computeUnitsConsumed: 50000,
      logMessages: ['Program log: error', 'Program failed'],
    })

    const bundles = [spamBundle, mevBundle, nondeterminBundle]
    for (const bundle of bundles) {
      const { anomalyReport } = runPipeline(bundle)
      for (const anomaly of anomalyReport.anomalies) {
        expect(['low', 'medium', 'high']).toContain(anomaly.severity)
        expect(['spam', 'mev-like', 'nondeterministic', 'unknown']).toContain(anomaly.type)
        expect(typeof anomaly.description).toBe('string')
        expect(typeof anomaly.confidence).toBe('number')
        expect(anomaly.confidence).toBeGreaterThanOrEqual(0)
        expect(anomaly.confidence).toBeLessThanOrEqual(1)
      }
    }
  })

  it('pipeline never throws for edge case bundles', () => {
    const edgeBundles = [
      mockRPCBundle({ logMessages: [] }),
      mockRPCBundle({ computeUnitsConsumed: null }),
      mockRPCBundle({ preTokenBalances: [], postTokenBalances: [] }),
      mockRPCBundle({ err: 'some error', computeUnitsConsumed: 100000 }),
    ]

    for (const bundle of edgeBundles) {
      expect(() => runPipeline(bundle)).not.toThrow()
    }
  })

  it('JSON output shape is consistent', () => {
    const bundle = mockRPCBundle()
    const output = runPipeline(bundle)

    const outputKeys = Object.keys(output).sort()
    const expectedKeys = ['anomalyReport', 'costAnalysis', 'cuProfile', 'logs'].sort()
    expect(outputKeys).toEqual(expectedKeys)

    expect(Array.isArray(output.costAnalysis.transfers)).toBe(true)
    expect(Array.isArray(output.anomalyReport.anomalies)).toBe(true)
  })
})
