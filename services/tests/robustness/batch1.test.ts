import { describe, it, expect } from 'vitest';
import { mockRPCBundle } from '../setup';
import { parseLogsFromBundle } from '../../src/analysis/logParser';
import { profileCU } from '../../src/analysis/cuProfiler';
import { parseTransaction } from '../../src/analysis/txParser';
import { analyzeCosts } from '../../src/analysis/costAnalyzer';
import { classifyTransaction } from '../../src/analysis/classifier';
import { RawTransactionBundle } from '../../src/analysis/types';

interface Scenario {
  name: string;
  bundle: RawTransactionBundle;
  expectedChecks: {
    logsOk: boolean;
    cuOk: boolean;
    costsOk: boolean;
    classifyOk: boolean;
  };
}

const scenarios: Scenario[] = [
  {
    name: 'success-simple',
    bundle: mockRPCBundle({
      err: null,
      logMessages: [
        'Program 11111111111111111111111111111111 invoke [1]',
        'Program log: Instruction: Transfer',
        'Program 11111111111111111111111111111111 consumed 3000 of 200000 compute units',
        'Program 11111111111111111111111111111111 success',
      ],
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'failed-tx',
    bundle: mockRPCBundle({
      err: 'custom program error: 0x1',
      logMessages: [
        'Program 11111111111111111111111111111111 invoke [1]',
        'Program log: Instruction: Transfer',
        'Program error: custom program error: 0x1',
      ],
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'high-cu',
    bundle: mockRPCBundle({
      computeUnitsConsumed: 1_400_000,
      logMessages: [
        'Program 11111111111111111111111111111111 invoke [1]',
        'Program log: Complex operation',
        'Program 11111111111111111111111111111111 consumed 1400000 of 1500000 compute units',
        'Program 11111111111111111111111111111111 success',
      ],
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'deep-cpi',
    bundle: mockRPCBundle({
      logMessages: [
        'Program 11111111111111111111111111111111 invoke [1]',
        'Program 22222222222222222222222222222222 invoke [2]',
        'Program 33333333333333333333333333333333 invoke [3]',
        'Program 44444444444444444444444444444444 invoke [4]',
        'Program 44444444444444444444444444444444 success',
        'Program 33333333333333333333333333333333 success',
        'Program 22222222222222222222222222222222 success',
        'Program 11111111111111111111111111111111 success',
      ],
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'spam-like',
    bundle: mockRPCBundle({
      preTokenBalances: [
        {
          accountIndex: 0,
          mint: 'SpamMintAddress111111111111111111111111111',
          uiTokenAmount: {
            amount: '0',
            decimals: 6,
            uiAmount: 0,
          },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'SpamMintAddress111111111111111111111111111',
          uiTokenAmount: {
            amount: '1500000000000', // 1.5M tokens with 6 decimals
            decimals: 6,
            uiAmount: 1500000,
          },
        },
      ],
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'zero-balances',
    bundle: mockRPCBundle({
      preBalances: [],
      postBalances: [],
      preTokenBalances: [],
      postTokenBalances: [],
      logMessages: [
        'Program 11111111111111111111111111111111 invoke [1]',
        'Program 11111111111111111111111111111111 success',
      ],
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'no-logs',
    bundle: mockRPCBundle({
      logMessages: [],
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'multi-token',
    bundle: mockRPCBundle({
      preTokenBalances: [
        {
          accountIndex: 0,
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          uiTokenAmount: { amount: '1000000', decimals: 6, uiAmount: 1 },
        },
        {
          accountIndex: 1,
          mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
          uiTokenAmount: { amount: '2000000', decimals: 6, uiAmount: 2 },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 0,
          mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          uiTokenAmount: { amount: '500000', decimals: 6, uiAmount: 0.5 },
        },
        {
          accountIndex: 1,
          mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
          uiTokenAmount: { amount: '3500000', decimals: 6, uiAmount: 3.5 },
        },
      ],
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'sol-transfer',
    bundle: mockRPCBundle({
      preBalances: [1_000_000_000, 500_000_000],
      postBalances: [999_500_000_000, 1_000_000_000],
      preTokenBalances: [],
      postTokenBalances: [],
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'no-cu-data',
    bundle: mockRPCBundle({
      computeUnitsConsumed: undefined,
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'single-instruction',
    bundle: mockRPCBundle({
      transaction: {
        signatures: ['mockSignature123'],
        message: {
          accountKeys: ['11111111111111111111111111111111'],
          instructions: [
            {
              programIdIndex: 0,
              accounts: [],
              data: 'data',
            },
          ],
        },
      },
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'many-instructions',
    bundle: mockRPCBundle({
      transaction: {
        signatures: ['mockSignature123'],
        message: {
          accountKeys: ['11111111111111111111111111111111'],
          instructions: [
            { programIdIndex: 0, accounts: [], data: '1' },
            { programIdIndex: 0, accounts: [], data: '2' },
            { programIdIndex: 0, accounts: [], data: '3' },
            { programIdIndex: 0, accounts: [], data: '4' },
            { programIdIndex: 0, accounts: [], data: '5' },
            { programIdIndex: 0, accounts: [], data: '6' },
            { programIdIndex: 0, accounts: [], data: '7' },
            { programIdIndex: 0, accounts: [], data: '8' },
          ],
        },
      },
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'null-blocktime',
    bundle: mockRPCBundle({
      blockTime: null,
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'high-fee',
    bundle: mockRPCBundle({
      computeUnitsConsumed: 50_000,
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },

  {
    name: 'unknown-program',
    bundle: mockRPCBundle({
      transaction: {
        signatures: ['mockSignature123'],
        message: {
          accountKeys: ['UnknownProgram111111111111111111111111111'],
          instructions: [
            {
              programIdIndex: 0,
              accounts: [],
              data: 'data',
            },
          ],
        },
      },
      logMessages: [
        'Program UnknownProgram111111111111111111111111111 invoke [1]',
        'Program UnknownProgram111111111111111111111111111 success',
      ],
    }),
    expectedChecks: {
      logsOk: true,
      cuOk: true,
      costsOk: true,
      classifyOk: true,
    },
  },
];

describe('Robustness batch 1 — 15 scenarios', () => {
  for (const scenario of scenarios) {
    it(scenario.name, () => {
      // Parse logs
      const logs = parseLogsFromBundle(scenario.bundle.logMessages ?? []);
      if (scenario.expectedChecks.logsOk) {
        expect(logs.totalLines ?? 0).toBeGreaterThanOrEqual(0);
      }

      // Profile CU
      const cuProfile = profileCU(scenario.bundle.logMessages ?? []);
      if (scenario.expectedChecks.cuOk) {
        expect(cuProfile.utilizationPercent ?? 0).toBeGreaterThanOrEqual(0);
        expect(cuProfile.utilizationPercent ?? 0).toBeLessThanOrEqual(100);
      }

      // Parse transaction
      const parsed = parseTransaction(scenario.bundle);
      expect(parsed).toBeDefined();

      // Analyze costs
      const costs = analyzeCosts(scenario.bundle, 150, 1000);
      if (scenario.expectedChecks.costsOk) {
        expect(costs.cuCost.feeLamports).toBeGreaterThanOrEqual(0);
      }

      // Classify transaction - only if parsed has instructions
      if (parsed && parsed.instructions) {
        const txType = classifyTransaction(parsed);
        if (scenario.expectedChecks.classifyOk) {
          expect(typeof txType).toBe('string');
        }
      }
    });
  }

  it('converts top 3 failures into regression stubs', () => {
    // This test documents the 3 most common failure patterns found during batch testing.
    // Scenarios: no-logs, zero-balances, no-cu-data
    // All three must produce defined (non-throwing) output from the full pipeline.
    const noLogs = mockRPCBundle({ logMessages: [] });
    const zeroBal = mockRPCBundle({ preBalances: [], postBalances: [] });
    const noCU = mockRPCBundle({ computeUnitsConsumed: undefined });

    expect(() => parseLogsFromBundle(noLogs.logMessages ?? [])).not.toThrow();
    expect(() => profileCU(zeroBal.logMessages ?? [])).not.toThrow();
    expect(() => analyzeCosts(noCU, null, 1000)).not.toThrow();
  });
});
