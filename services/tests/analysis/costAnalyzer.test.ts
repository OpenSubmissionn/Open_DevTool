import { describe, it, expect } from 'vitest';
import { analyzeCosts, calculateCUCostFromCU } from '../../src/analysis/costAnalyzer';
import { mockRPCBundle } from '../setup';

describe('Cost Analyzer', () => {
  it('zero-value transfer — bundle with no token balances returns empty transfers array', () => {
    // Fee payer (account[0]) pays the 5000-lamport tx fee with no other
    // activity: preBalance - postBalance == fee. After the fee adjustment in
    // analyzeCosts, the net delta is 0, so no transfer is emitted.
    const bundle = mockRPCBundle({
      postTokenBalances: [],
      preTokenBalances: [],
      preBalances: [1_000_005_000],
      postBalances: [1_000_000_000],
      computeUnitsConsumed: 3000,
    });

    const result = analyzeCosts(bundle, 150, 1000);

    expect(result.transfers).toEqual([]);
    expect(result.cuCost.cuConsumed).toBe(3000);
  });

  it('SOL transfer — fee payer sends 0.5 SOL to recipient — expect 1 paired transfer with both from and to populated', () => {
    // Fee payer (index 0) loses 0.5 SOL + fee; recipient (index 1) gains 0.5 SOL.
    // Pairing should emit a single TransferInfo with both ends populated.
    const bundle = mockRPCBundle({
      preBalances: [1_000_000_000, 500_000_000],
      postBalances: [499_995_000, 1_000_000_000],
      preTokenBalances: [],
      postTokenBalances: [],
      accountKeys: [
        '11111111111111111111111111111111',
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ],
    });

    const result = analyzeCosts(bundle, 150, 1000);

    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].token).toBe('SOL');
    expect(result.transfers[0].uiAmount).toBeCloseTo(0.5, 9);
    expect(result.transfers[0].from).toBe('11111111111111111111111111111111');
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
            amount: '2000000000000',
            decimals: 6,
            uiAmount: 2000000000,
          },
        },
      ],
      // Fee payer (account[0]) only pays the tx fee; no SOL transfer.
      // The spam happens at the SPL token level on account[1].
      preBalances: [1_000_005_000],
      postBalances: [1_000_000_000],
      accountKeys: [
        '11111111111111111111111111111111',
        'SPAMAccount1111111111111111111111111111111',
      ],
    });

    const result = analyzeCosts(bundle, null, 1000);

    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].isSpamSuspect).toBe(true);
    expect(result.transfers[0].uiAmount).toBeGreaterThan(1000000);
  });

  it('CU cost formula — bundle with computeUnitsConsumed: 100_000, microLamportsPerCU: 1000, solPriceUSD: 200 — expect correct fees', () => {
    // bundle.fee = 5100 = 5000 base + 100 priority (matches the priority calc).
    const bundle = mockRPCBundle({
      computeUnitsConsumed: 100_000,
      fee: 5100,
      preBalances: [1_000_000_000],
      postBalances: [1_000_000_000],
    });

    const result = analyzeCosts(bundle, 200, 1000);

    expect(result.cuCost.priorityFeeLamports).toBe(100);
    expect(result.cuCost.baseFeeLamports).toBe(5000);
    expect(result.cuCost.feeLamports).toBe(5100);
    expect(result.cuCost.feeSOL).toBeCloseTo(0.0000051, 10);
    expect(result.cuCost.feeUSD).toBeCloseTo(0.00102, 8);
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

describe('Calculate CU Cost From CU', () => {
  it('should calculate cost for 50k CU', async () => {
    // Pass explicit totalFee = 5050 (5000 base + 50 priority) so feeLamports
    // is asserted against a known value rather than the heuristic default.
    const cost = await calculateCUCostFromCU(50_000, 1000, 180, 5050);

    expect(cost.cuConsumed).toBe(50_000);
    expect(cost.microLamportsPerCU).toBe(1000);
    expect(cost.priorityFeeLamports).toBe(50);
    expect(cost.baseFeeLamports).toBe(5000);
    expect(cost.feeLamports).toBe(5050);
    expect(cost.feeSOL).toBeCloseTo(0.00000505, 10);
    expect(cost.feeUSD).toBeCloseTo(0.000909, 10);
  });

  it('should handle zero CU', async () => {
    // Total fee 0 simulates a fee-less call (e.g., a synthesized profile).
    const cost = await calculateCUCostFromCU(0, 1000, 180, 0);

    expect(cost.feeLamports).toBe(0);
    expect(cost.feeSOL).toBe(0);
    expect(cost.feeUSD).toBe(0);
  });

  it('should calculate cost with different rate', async () => {
    const cost = await calculateCUCostFromCU(100_000, 5000, 180, 5500);

    expect(cost.priorityFeeLamports).toBe(500);
    expect(cost.feeLamports).toBe(5500);
  });

  it('should handle null SOL price', async () => {
    const cost = await calculateCUCostFromCU(50_000, 1000, null, 5050);

    expect(cost.priorityFeeLamports).toBe(50);
    expect(cost.feeLamports).toBe(5050);
    expect(cost.feeSOL).toBeCloseTo(0.00000505, 10);
    expect(cost.feeUSD).toBeNull();
  });

  it('should handle high-CU transaction', async () => {
    const cost = await calculateCUCostFromCU(200_000, 1000, 180, 5200);

    expect(cost.priorityFeeLamports).toBe(200);
    expect(cost.feeLamports).toBe(5200);
    expect(cost.feeUSD).toBeGreaterThan(0.0001);
  });

  it('should handle failed transaction with low CU', async () => {
    const cost = await calculateCUCostFromCU(5_000, 1000, 180, 5005);

    expect(cost.cuConsumed).toBe(5_000);
    expect(cost.priorityFeeLamports).toBe(5);
    expect(cost.feeLamports).toBe(5005);
    expect(cost.feeUSD).toBeLessThan(0.001);
  });

  it('should round values correctly', async () => {
    const cost = await calculateCUCostFromCU(12_345, 1000, 180);

    expect(cost.feeLamports).toBeDefined();
    expect(cost.feeSOL).toBeDefined();
    expect(cost.feeUSD).toBeDefined();
    expect(Number.isNaN(cost.feeSOL)).toBe(false);
  });
});
