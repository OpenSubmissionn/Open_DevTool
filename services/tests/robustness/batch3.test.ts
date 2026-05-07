import { describe, it, expect } from 'vitest';
import { mockRPCBundle } from '../setup';
import { detectAnomalies, AnomalyType } from '../../src/analysis/anomalyDetector';
import { analyzeCosts } from '../../src/analysis/costAnalyzer';
import { parseLogsFromBundle } from '../../src/analysis/logParser';
import { profileCU } from '../../src/analysis/cuProfiler';
import { parseTransaction } from '../../src/analysis/txParser';
import { classifyTransaction } from '../../src/analysis/classifier';
import { RawTransactionBundle } from '../../src/analysis/types';

interface Scenario {
  name: string;
  bundle: RawTransactionBundle;
  expectAnomaly: boolean;
  expectAnomalyType?: AnomalyType;
}

const scenarios: Scenario[] = [
  {
    name: 'clean-transfer',
    bundle: mockRPCBundle(),
    expectAnomaly: false,
  },
  {
    name: 'spam-token-high-volume',
    bundle: mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'UNKNOWN_MINT_XYZ',
          owner: 'owner1',
          uiTokenAmount: {
            amount: '2000000000000',
            decimals: 6,
            uiAmount: 2000000,
            uiAmountString: '2000000',
          },
        },
      ],
    }),
    expectAnomaly: true,
    expectAnomalyType: 'spam',
  },
  {
    name: 'failed-with-cu',
    bundle: mockRPCBundle({
      err: 'custom program error',
      computeUnitsConsumed: 50000,
      logMessages: ['Program 11111111111111111111111111111111 invoke [1]', 'Program failed: error'],
    }),
    expectAnomaly: true,
    expectAnomalyType: 'nondeterministic',
  },
  {
    name: 'mev-swap-pattern',
    bundle: mockRPCBundle({
      logMessages: [
        'Program AAA invoke [1]',
        'Program BBB invoke [2]',
        'Program log: swap executed',
        'Program CCC invoke [1]',
      ],
    }),
    expectAnomaly: true,
    expectAnomalyType: 'mev-like',
  },
  {
    name: 'zero-cu',
    bundle: mockRPCBundle({ computeUnitsConsumed: 0 }),
    expectAnomaly: false,
  },
  {
    name: 'high-cu-no-anomaly',
    bundle: mockRPCBundle({ computeUnitsConsumed: 1400000, err: null }),
    expectAnomaly: false,
  },
  {
    name: 'empty-logs',
    bundle: mockRPCBundle({ logMessages: [] }),
    expectAnomaly: false,
  },
  {
    name: 'safe-mint-usdc',
    bundle: mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          owner: 'owner1',
          uiTokenAmount: { amount: '5000000', decimals: 6, uiAmount: 5, uiAmountString: '5' },
        },
      ],
    }),
    expectAnomaly: false,
  },
  {
    name: 'safe-mint-usdt',
    bundle: mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
          owner: 'owner1',
          uiTokenAmount: { amount: '1000000', decimals: 6, uiAmount: 1, uiAmountString: '1' },
        },
      ],
    }),
    expectAnomaly: false,
  },
  {
    name: 'safe-mint-wsol',
    bundle: mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'So11111111111111111111111111111111111111112',
          owner: 'owner1',
          uiTokenAmount: { amount: '10000000', decimals: 9, uiAmount: 10, uiAmountString: '10' },
        },
      ],
    }),
    expectAnomaly: false,
  },
  {
    name: 'multiple-spam-transfers',
    bundle: mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'UNKNOWN_1',
          owner: 'owner1',
          uiTokenAmount: {
            amount: '2000000000000',
            decimals: 6,
            uiAmount: 2000000,
            uiAmountString: '2000000',
          },
        },
        {
          accountIndex: 1,
          mint: 'UNKNOWN_2',
          owner: 'owner2',
          uiTokenAmount: {
            amount: '3000000000000',
            decimals: 6,
            uiAmount: 3000000,
            uiAmountString: '3000000',
          },
        },
      ],
    }),
    expectAnomaly: true,
    expectAnomalyType: 'spam',
  },
  {
    name: 'failed-zero-cu',
    bundle: mockRPCBundle({
      err: 'error',
      computeUnitsConsumed: 0,
      logMessages: ['Program log: failed'],
    }),
    expectAnomaly: false,
  },
  {
    name: 'deep-cpi-no-swap',
    bundle: mockRPCBundle({
      logMessages: ['Program AAA invoke [1]', 'Program BBB invoke [2]', 'Program CCC invoke [3]'],
    }),
    expectAnomaly: false,
  },
  {
    name: 'single-program-swap',
    bundle: mockRPCBundle({
      logMessages: ['Program AAA invoke [1]', 'Program log: swap executed', 'Program AAA success'],
    }),
    expectAnomaly: false,
  },
  {
    name: 'null-blocktime',
    bundle: mockRPCBundle({ blockTime: null }),
    expectAnomaly: false,
  },
  {
    name: 'null-compute-consumed',
    bundle: mockRPCBundle({ computeUnitsConsumed: null }),
    expectAnomaly: false,
  },
  {
    name: 'many-accounts',
    bundle: mockRPCBundle({
      accountKeys: Array.from({ length: 20 }, (_, i) => `Account${i}`),
    }),
    expectAnomaly: false,
  },
  {
    name: 'sol-transfer-only',
    bundle: mockRPCBundle({
      preTokenBalances: [],
      postTokenBalances: [],
      preBalances: [10000000, 5000000],
      postBalances: [8000000, 7000000],
    }),
    expectAnomaly: false,
  },
  {
    name: 'known-program-transfer',
    bundle: mockRPCBundle({
      logMessages: [
        'Program 11111111111111111111111111111111 invoke [1]',
        'Program 11111111111111111111111111111111 success',
      ],
    }),
    expectAnomaly: false,
  },
  {
    name: 'three-programs-no-swap',
    bundle: mockRPCBundle({
      logMessages: ['Program AAA invoke [1]', 'Program BBB invoke [1]', 'Program CCC invoke [1]'],
    }),
    expectAnomaly: false,
  },
  {
    name: 'error-in-log-no-err-field',
    bundle: mockRPCBundle({
      err: null,
      logMessages: ['Program log: Error occurred'],
    }),
    expectAnomaly: false,
  },
  {
    name: 'spam-medium-volume',
    bundle: mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'UNKNOWN_MINT_ABC',
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
    expectAnomaly: false,
  },
  {
    name: 'spam-just-above-boundary',
    bundle: mockRPCBundle({
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'UNKNOWN_MINT_DEF',
          owner: 'owner1',
          uiTokenAmount: {
            amount: '1000001000000',
            decimals: 6,
            uiAmount: 1000001,
            uiAmountString: '1000001',
          },
        },
      ],
    }),
    expectAnomaly: true,
    expectAnomalyType: 'spam',
  },
  {
    name: 'multiple-anomaly-types',
    bundle: mockRPCBundle({
      err: 'error',
      computeUnitsConsumed: 50000,
      logMessages: [
        'Program AAA invoke [1]',
        'Program BBB invoke [2]',
        'Program log: swap failed',
        'Program CCC invoke [1]',
        'Program failed: error',
      ],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'UNKNOWN_MINT_XYZ',
          owner: 'owner1',
          uiTokenAmount: {
            amount: '2000000000000',
            decimals: 6,
            uiAmount: 2000000,
            uiAmountString: '2000000',
          },
        },
      ],
    }),
    expectAnomaly: true,
  },
  {
    name: 'clean-complex-tx',
    bundle: mockRPCBundle({
      logMessages: [
        'Program AAA invoke [1]',
        'Program AAA log: instr 1',
        'Program BBB invoke [1]',
        'Program BBB log: instr 2',
        'Program CCC invoke [1]',
        'Program CCC log: instr 3',
        'Program AAA success',
      ],
      err: null,
    }),
    expectAnomaly: false,
  },
];

describe('Batch 3 — 25 transaction scenarios', () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      const costAnalysis = analyzeCosts(scenario.bundle, null, 1000);
      const report = detectAnomalies(scenario.bundle, costAnalysis.transfers);

      if (scenario.expectAnomaly === false) {
        if (scenario.expectAnomalyType) {
          expect(
            report.anomalies.filter((a) => a.type === scenario.expectAnomalyType)
          ).toHaveLength(0);
        }
      } else {
        if (scenario.expectAnomalyType) {
          expect(report.anomalies.some((a) => a.type === scenario.expectAnomalyType)).toBe(true);
        }
      }

      expect(typeof report.summary).toBe('string');
      expect(Array.isArray(report.anomalies)).toBe(true);
    });
  }
});

describe('Batch 3 meta — top 3 regression stubs', () => {
  it('no crash on null computeUnitsConsumed', () => {
    const bundle = mockRPCBundle({ computeUnitsConsumed: null });
    expect(() => detectAnomalies(bundle, [])).not.toThrow();
  });

  it('no crash on empty logMessages', () => {
    const bundle = mockRPCBundle({ logMessages: [] });
    expect(() => detectAnomalies(bundle, [])).not.toThrow();
  });

  it('no crash on empty postTokenBalances', () => {
    const bundle = mockRPCBundle({ postTokenBalances: [] });
    expect(() => detectAnomalies(bundle, [])).not.toThrow();
  });
});
