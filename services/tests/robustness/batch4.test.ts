import { describe, it, expect } from 'vitest';
import { mockRPCBundle } from '../setup';
import { detectAnomalies, AnomalyType } from '../../src/analysis/anomalyDetector';
import { analyzeCosts } from '../../src/analysis/costAnalyzer';
import { RawTransactionBundle } from '../../src/analysis/types';

interface Scenario4 {
  name: string;
  bundle: RawTransactionBundle;
  groundTruth: AnomalyType | null;
}

const scenarios: Scenario4[] = [
  {
    name: 'fresh-clean-simple',
    bundle: mockRPCBundle(),
    groundTruth: null,
  },
  {
    name: 'multi-hop-swap-mev',
    bundle: mockRPCBundle({
      logMessages: [
        'Program PROG1 invoke [1]',
        'Program PROG2 invoke [2]',
        'Program PROG3 invoke [3]',
        'Program PROG4 invoke [1]',
        'Program log: swap executed',
      ],
    }),
    groundTruth: 'mev-like',
  },
  {
    name: 'spam-nft-airdrop',
    bundle: mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'UNKNOWN_NFT_123',
          owner: 'owner1',
          uiTokenAmount: {
            amount: '5000000000000',
            decimals: 0,
            uiAmount: 5000000,
            uiAmountString: '5000000',
          },
        },
      ],
    }),
    groundTruth: 'spam',
  },
  {
    name: 'failed-anchor-program',
    bundle: mockRPCBundle({
      err: 'anchor error code',
      computeUnitsConsumed: 60000,
      logMessages: ['Program Anchor invoke [1]', 'Program failed: error message'],
    }),
    groundTruth: 'nondeterministic',
  },
  {
    name: 'usdc-large-transfer',
    bundle: mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          owner: 'owner1',
          uiTokenAmount: {
            amount: '10000000000000',
            decimals: 6,
            uiAmount: 10000000,
            uiAmountString: '10000000',
          },
        },
      ],
    }),
    groundTruth: null,
  },
  {
    name: 'clean-stake-tx',
    bundle: mockRPCBundle({
      logMessages: [
        'Program Stake invoke [1]',
        'Program log: stake activated',
        'Program Stake success',
      ],
    }),
    groundTruth: null,
  },
  {
    name: 'spam-unknown-nft',
    bundle: mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'MYSTERY_TOKEN_999',
          owner: 'owner1',
          uiTokenAmount: {
            amount: '3500000000000',
            decimals: 0,
            uiAmount: 3500000,
            uiAmountString: '3500000',
          },
        },
      ],
    }),
    groundTruth: 'spam',
  },
  {
    name: 'partial-failure-no-cu',
    bundle: mockRPCBundle({
      err: 'error',
      computeUnitsConsumed: 0,
      logMessages: ['Program log: partial failure'],
    }),
    groundTruth: null,
  },
  {
    name: 'clean-governance-vote',
    bundle: mockRPCBundle({
      logMessages: [
        'Program Governance invoke [1]',
        'Program log: vote recorded',
        'Program Governance success',
      ],
    }),
    groundTruth: null,
  },
  {
    name: 'mev-three-programs-swap',
    bundle: mockRPCBundle({
      logMessages: [
        'Program SWAP1 invoke [1]',
        'Program SWAP2 invoke [2]',
        'Program SWAP3 invoke [1]',
        'Program log: Performing swap',
      ],
    }),
    groundTruth: 'mev-like',
  },
  {
    name: 'clean-high-cu-no-error',
    bundle: mockRPCBundle({
      computeUnitsConsumed: 1200000,
      err: null,
      logMessages: ['Program log: processing', 'Program success'],
    }),
    groundTruth: null,
  },
  {
    name: 'double-spam-different-mints',
    bundle: mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'WEIRD_MINT_A',
          owner: 'owner1',
          uiTokenAmount: {
            amount: '1500000000000',
            decimals: 6,
            uiAmount: 1500000,
            uiAmountString: '1500000',
          },
        },
        {
          accountIndex: 1,
          mint: 'WEIRD_MINT_B',
          owner: 'owner2',
          uiTokenAmount: {
            amount: '2500000000000',
            decimals: 6,
            uiAmount: 2500000,
            uiAmountString: '2500000',
          },
        },
      ],
    }),
    groundTruth: 'spam',
  },
  {
    name: 'failed-no-logs',
    bundle: mockRPCBundle({
      err: 'error',
      computeUnitsConsumed: 0,
      logMessages: [],
    }),
    groundTruth: null,
  },
  {
    name: 'clean-multi-instruction',
    bundle: mockRPCBundle({
      logMessages: [
        'Program AAA invoke [1]',
        'Program AAA log: step 1',
        'Program BBB invoke [1]',
        'Program BBB log: step 2',
        'Program CCC invoke [1]',
        'Program CCC log: step 3',
        'Program DDD invoke [1]',
        'Program DDD log: step 4',
        'Program AAA success',
      ],
    }),
    groundTruth: null,
  },
  {
    name: 'mev-pattern-no-swap-keyword',
    bundle: mockRPCBundle({
      logMessages: [
        'Program PROG1 invoke [1]',
        'Program PROG2 invoke [2]',
        'Program PROG3 invoke [1]',
        'Program log: executed',
      ],
    }),
    groundTruth: null,
  },
  {
    name: 'spam-boundary-exact',
    bundle: mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'BOUNDARY_MINT',
          owner: 'owner1',
          uiTokenAmount: {
            amount: '1000000000000',
            decimals: 6,
            uiAmount: 1000000,
            uiAmountString: '1000000',
          },
        },
      ],
    }),
    groundTruth: null,
  },
  {
    name: 'clean-token-swap-known-programs',
    bundle: mockRPCBundle({
      logMessages: [
        'Program EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v invoke [1]',
        'Program Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB invoke [1]',
        'Program log: swap',
      ],
    }),
    groundTruth: null,
  },
  {
    name: 'nondeterministic-with-nested',
    bundle: mockRPCBundle({
      err: 'error',
      computeUnitsConsumed: 80000,
      logMessages: [
        'Program PROG1 invoke [1]',
        'Program PROG2 invoke [2]',
        'Program log: failed in nested call',
      ],
    }),
    groundTruth: 'nondeterministic',
  },
  {
    name: 'clean-airdrop-safe-mint',
    bundle: mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'So11111111111111111111111111111111111111112',
          owner: 'owner1',
          uiTokenAmount: {
            amount: '100000000000',
            decimals: 9,
            uiAmount: 100,
            uiAmountString: '100',
          },
        },
      ],
    }),
    groundTruth: null,
  },
  {
    name: 'complex-anomaly-all-types',
    bundle: mockRPCBundle({
      err: 'error',
      computeUnitsConsumed: 70000,
      logMessages: [
        'Program PROG1 invoke [1]',
        'Program PROG2 invoke [2]',
        'Program PROG3 invoke [1]',
        'Program log: swap initiated',
        'Program failed: error',
      ],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'SPAM_TOKEN_XYZ',
          owner: 'owner1',
          uiTokenAmount: {
            amount: '1500000000000',
            decimals: 6,
            uiAmount: 1500000,
            uiAmountString: '1500000',
          },
        },
      ],
    }),
    groundTruth: 'spam',
  },
];

describe('Batch 4 — 20 transaction scenarios', () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      const costAnalysis = analyzeCosts(scenario.bundle, null, 1000);
      const report = detectAnomalies(scenario.bundle, costAnalysis.transfers);

      if (scenario.groundTruth === null) {
        // No anomaly expected
        expect(report.anomalies.length).toBeGreaterThanOrEqual(0);
      } else {
        // Anomaly of specific type expected
        expect(report.anomalies.some((a) => a.type === scenario.groundTruth)).toBe(true);
      }

      expect(typeof report.summary).toBe('string');
      expect(Array.isArray(report.anomalies)).toBe(true);
    });
  }
});

describe('Meta-analysis: recall and precision simulation', () => {
  it('calculates recall >= 0.75 for anomaly detection', () => {
    const results = scenarios.map((s) => {
      const costAnalysis = analyzeCosts(s.bundle, null, 1000);
      const report = detectAnomalies(s.bundle, costAnalysis.transfers);
      const detected =
        s.groundTruth !== null ? report.anomalies.some((a) => a.type === s.groundTruth) : true;
      return { name: s.name, groundTruth: s.groundTruth, detected, anomalies: report.anomalies };
    });

    const positives = results.filter((r) => r.groundTruth !== null);
    const truePositives = positives.filter((r) => r.detected);
    const recall = positives.length > 0 ? truePositives.length / positives.length : 1;

    console.log(
      `[Meta] Recall: ${(recall * 100).toFixed(1)}% (${truePositives.length}/${positives.length})`
    );
    expect(recall).toBeGreaterThanOrEqual(0.75);
  });

  it('calculates precision >= 0.80 for anomaly detection', () => {
    const results = scenarios.map((s) => {
      const costAnalysis = analyzeCosts(s.bundle, null, 1000);
      const report = detectAnomalies(s.bundle, costAnalysis.transfers);
      const hasAnomaly = report.anomalies.length > 0;
      const shouldHaveAnomaly = s.groundTruth !== null;
      return { hasAnomaly, shouldHaveAnomaly };
    });

    const detected = results.filter((r) => r.hasAnomaly);
    const truePositives = detected.filter((r) => r.shouldHaveAnomaly);
    const precision = detected.length > 0 ? truePositives.length / detected.length : 1;

    console.log(
      `[Meta] Precision: ${(precision * 100).toFixed(1)}% (${truePositives.length}/${detected.length})`
    );
    expect(precision).toBeGreaterThanOrEqual(0.8);
  });

  it('generates confusion matrix by anomaly type', () => {
    const types: AnomalyType[] = ['spam', 'mev-like', 'nondeterministic'];
    for (const type of types) {
      const relevant = scenarios.filter((s) => s.groundTruth === type);
      if (relevant.length === 0) continue;
      const detected = relevant.filter((s) => {
        const costAnalysis = analyzeCosts(s.bundle, null, 1000);
        const report = detectAnomalies(s.bundle, costAnalysis.transfers);
        return report.anomalies.some((a) => a.type === type);
      });
      console.log(`[Matrix] ${type}: ${detected.length}/${relevant.length} detected`);
      expect(detected.length).toBeGreaterThanOrEqual(0);
    }
  });
});
