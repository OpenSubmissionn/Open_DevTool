import { describe, it, expect } from 'vitest';
import { analyzeCosts } from '../../src/analysis/costAnalyzer';
import { mockRPCBundle } from '../setup';

describe('Cost Analyzer', () => {
  it('zero-value transfer — bundle with no token balances returns empty transfers array', () => {
    const bundle = mockRPCBundle({
      postTokenBalances: [],
      preTokenBalances: [],
      preBalances: [1_000_000_000],
      postBalances: [1_000_000_000],
    });

    const result = analyzeCosts(bundle, 150, 1000);

    expect(result.transfers).toEqual([]);
    expect(result.cuCost.cuConsumed).toBe(3000);
  });

  it('SOL transfer — preBalances [1_000_000, 500_000], postBalances [995_000, 1_000_000] (index 0 is fee payer, skip) — expect 1 transfer with correct uiAmount in SOL', () => {
    const bundle = mockRPCBundle({
      preBalances: [1_000_000_000, 500_000_000], // 1 SOL, 0.5 SOL
      postBalances: [999_500_000_000, 1_000_000_000], // 0.9995 SOL, 1 SOL
      preTokenBalances: [],
      postTokenBalances: [],
      accountKeys: ['11111111111111111111111111111111', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
    });

    const result = analyzeCosts(bundle, 150, 1000);

    // Should have transfers: index 0 (fee -500_000, skip) and index 1 (+500_000_000 lamports = 0.5 SOL)
    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].token).toBe('SOL');
    expect(result.transfers[0].uiAmount).toBeCloseTo(0.5, 9); // 500_000_000 / 1_000_000_000
    expect(result.transfers[0].to).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });

  it('spam detection — create a token transfer with uiAmount > 1_000_000 and unknown mint — expect isSpamSuspect: true', () => {
    const unknownMint = 'SpamMintAddress11111111111111111111111111';
    const bundle = mockRPCBundle({
      preTokenBalances: [
        {
          accountIndex: 1,
          mint: unknownMint,
          uiTokenAmount: {
            amount: '0',
            decimals: 6,
            uiAmount: 0,
          },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: unknownMint,
          uiTokenAmount: {
            amount: '2000000000000', // 2 trillion base units with 6 decimals = 2 billion UI amount
            decimals: 6,
            uiAmount: 2000000000,
          },
        },
      ],
      preBalances: [1_000_000_000],
      postBalances: [1_000_000_000],
      accountKeys: ['11111111111111111111111111111111', 'SPAMAccount1111111111111111111111111111111'],
    });

    const result = analyzeCosts(bundle, null, 1000);

    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].isSpamSuspect).toBe(true);
    expect(result.transfers[0].uiAmount).toBeGreaterThan(1000000);
  });

  it('CU cost formula — bundle with computeUnitsConsumed: 100_000, microLamportsPerCU: 1000, solPriceUSD: 200 — expect correct fees', () => {
    const bundle = mockRPCBundle({
      computeUnitsConsumed: 100_000,
      preBalances: [1_000_000_000],
      postBalances: [1_000_000_000],
    });

    const result = analyzeCosts(bundle, 200, 1000);

    // feeLamports = 100_000 * 1000 / 1_000_000 = 100
    expect(result.cuCost.feeLamports).toBe(100);
    // feeSOL = 100 / 1_000_000_000 = 0.0000001
    expect(result.cuCost.feeSOL).toBeCloseTo(0.0000001, 10);
    // feeUSD = 0.0000001 * 200 = 0.00002
    expect(result.cuCost.feeUSD).toBeCloseTo(0.00002, 8);
  });

  it('no sol price — solPriceUSD: null — expect feeUSD: null and totalTransferUSD: null', () => {
    const bundle = mockRPCBundle({
      computeUnitsConsumed: 50_000,
      preBalances: [1_000_000, 500_000],
      postBalances: [995_000, 1_000_000],
      preTokenBalances: [],
      postTokenBalances: [],
    });

    const result = analyzeCosts(bundle, null, 1000);

    expect(result.cuCost.feeUSD).toBe(null);
    expect(result.totalTransferUSD).toBe(null);
  });
});
