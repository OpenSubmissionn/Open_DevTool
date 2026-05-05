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

  it('back-derives priority fee when microLamportsPerCU is 0 (versioned tx with un-parsed ComputeBudget)', () => {
    // Real-world Pump.fun scenario: v0 tx with a high priority fee, but the
    // RPC didn't pre-parse the SetComputeUnitPrice instruction so the caller
    // passes 0 as microLamportsPerCU. analyzeCosts must back-derive the
    // priority fee from bundle.fee - baseFee.
    const bundle = mockRPCBundle({
      computeUnitsConsumed: 138_985,
      fee: 977_725, // 5000 base + 972725 priority
      preBalances: [1_000_000_000],
      postBalances: [999_022_275], // delta = -fee
      preTokenBalances: [],
      postTokenBalances: [],
    });

    const result = analyzeCosts(bundle, 150, 0);

    expect(result.cuCost.baseFeeLamports).toBe(5_000);
    expect(result.cuCost.priorityFeeLamports).toBe(972_725);
    expect(result.cuCost.feeLamports).toBe(977_725);
    // Identity must hold
    expect(result.cuCost.baseFeeLamports + result.cuCost.priorityFeeLamports).toBe(
      result.cuCost.feeLamports
    );
    // Price was back-derived, not the input 0
    expect(result.cuCost.microLamportsPerCU).toBeGreaterThan(0);
    // Back-derivation: round((972725 * 1e6) / 138985)
    expect(result.cuCost.microLamportsPerCU).toBe(Math.round((972_725 * 1_000_000) / 138_985));
  });

  it('preserves base + priority = total even when input price would over-estimate', () => {
    // Scenario where (cuConsumed × microLamportsPerCU / 1e6) exceeds what was
    // actually charged (e.g. ComputeUnitLimit set high but consumed less; or
    // manual test passing inflated price). The canonical bundle.fee wins.
    const bundle = mockRPCBundle({
      computeUnitsConsumed: 100_000,
      fee: 5_500, // 500 priority paid in reality
      preBalances: [1_000_000_000],
      postBalances: [999_994_500],
      preTokenBalances: [],
      postTokenBalances: [],
    });

    // Caller passes a price that would imply 1_000_000 lamports of priority,
    // far above the actual 500.
    const result = analyzeCosts(bundle, 150, 10_000);

    expect(result.cuCost.feeLamports).toBe(5_500);
    expect(result.cuCost.baseFeeLamports + result.cuCost.priorityFeeLamports).toBe(5_500);
    expect(result.cuCost.priorityFeeLamports).toBe(500);
  });

  it('multi-signature transaction — base fee scales with numRequiredSignatures', () => {
    // 2 signers → base fee = 10_000 lamports.
    const bundle = mockRPCBundle({
      computeUnitsConsumed: 50_000,
      fee: 10_000, // pure base fee, no priority
      preBalances: [1_000_000_000],
      postBalances: [999_990_000],
      preTokenBalances: [],
      postTokenBalances: [],
      rawResponse: {
        transaction: { message: { header: { numRequiredSignatures: 2 } } },
      } as any,
    });

    const result = analyzeCosts(bundle, 150, 0);

    expect(result.cuCost.baseFeeLamports).toBe(10_000);
    expect(result.cuCost.priorityFeeLamports).toBe(0);
  });

  it('SOL pairing — high-priority fee transaction matches outflow to inflow exactly', () => {
    // Reproduces the original Pump.fun bug: fee payer transfers 0.1 SOL while
    // also paying ~970k lamports priority fee. Without fee adjustment, the
    // outflow looks like 100_972_725 lamports and never matches the 100_000_000
    // inflow. After fee adjustment, both legs match exactly.
    const FEE = 977_725;
    const TRANSFER = 100_000_000;
    const bundle = mockRPCBundle({
      preBalances: [1_000_000_000, 500_000_000],
      postBalances: [1_000_000_000 - TRANSFER - FEE, 500_000_000 + TRANSFER],
      fee: FEE,
      preTokenBalances: [],
      postTokenBalances: [],
      accountKeys: ['FeePayer11111111111111111111111111111111111', 'Recipient22222222222222222222'],
    });

    const result = analyzeCosts(bundle, 150, 0);

    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].token).toBe('SOL');
    expect(result.transfers[0].uiAmount).toBeCloseTo(TRANSFER / 1e9, 9);
    expect(result.transfers[0].from).toBe('FeePayer11111111111111111111111111111111111');
    expect(result.transfers[0].to).toBe('Recipient22222222222222222222');
  });

  it('SOL pairing — unmatched inflow (rent reclaim / mint) surfaces with empty from', () => {
    // Account[0] pays only the fee. Account[1] receives SOL with no
    // corresponding outflow in the tx (e.g. program payout, rent reclaim).
    const bundle = mockRPCBundle({
      preBalances: [1_000_005_000, 0],
      postBalances: [1_000_000_000, 5_000_000],
      fee: 5_000,
      preTokenBalances: [],
      postTokenBalances: [],
      accountKeys: ['FeePayer11111111111111111111111111111111111', 'Beneficiary111111111111111111'],
    });

    const result = analyzeCosts(bundle, 150, 0);

    const inflowOnly = result.transfers.find((t) => t.token === 'SOL' && !t.from);
    expect(inflowOnly).toBeDefined();
    expect(inflowOnly?.to).toBe('Beneficiary111111111111111111');
    expect(inflowOnly?.uiAmount).toBeCloseTo(0.005, 9);
  });

  it('SOL pairing — unmatched outflow surfaces with empty to', () => {
    // Account[0] sends SOL whose recipient isn't in this tx's account list
    // (or was burnt). Should appear as outflow with no `to`.
    const bundle = mockRPCBundle({
      preBalances: [1_000_005_000],
      postBalances: [900_000_000], // burned 100_000_000 + 5000 fee
      fee: 5_000,
      preTokenBalances: [],
      postTokenBalances: [],
      accountKeys: ['Burner11111111111111111111111111111111111111'],
    });

    const result = analyzeCosts(bundle, 150, 0);

    const outflowOnly = result.transfers.find((t) => t.token === 'SOL' && !t.to);
    expect(outflowOnly).toBeDefined();
    expect(outflowOnly?.from).toBe('Burner11111111111111111111111111111111111111');
    expect(outflowOnly?.uiAmount).toBeCloseTo(0.1, 9);
  });

  it('handles postTokenBalances without preTokenBalances (account creation in same tx)', () => {
    // Covers the `if (bundle.preTokenBalances)` false branch.
    const mint = 'NewMint11111111111111111111111111111111111';
    const bundle = mockRPCBundle({
      preTokenBalances: undefined as any,
      postTokenBalances: [
        {
          accountIndex: 1,
          mint,
          uiTokenAmount: { amount: '1000000', decimals: 6, uiAmount: 1 },
        },
      ],
      preBalances: [1_000_005_000],
      postBalances: [1_000_000_000],
      fee: 5_000,
      accountKeys: [
        '11111111111111111111111111111111',
        'NewlyCreatedAta11111111111111111111111111',
      ],
    });

    const result = analyzeCosts(bundle, 150, 0);

    const tokenTransfer = result.transfers.find((t) => t.token === mint);
    expect(tokenTransfer).toBeDefined();
    expect(tokenTransfer?.uiAmount).toBe(1);
  });

  it('skips token balances where delta is zero (no actual transfer)', () => {
    // Covers the `if (delta === 0n) continue` branch.
    const mint = 'StableMint111111111111111111111111111111111';
    const bundle = mockRPCBundle({
      preTokenBalances: [
        {
          accountIndex: 1,
          mint,
          uiTokenAmount: { amount: '5000000', decimals: 6, uiAmount: 5 },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint,
          uiTokenAmount: { amount: '5000000', decimals: 6, uiAmount: 5 }, // unchanged
        },
      ],
      preBalances: [1_000_005_000],
      postBalances: [1_000_000_000],
      fee: 5_000,
    });

    const result = analyzeCosts(bundle, 150, 0);

    // No SPL transfer recorded — delta was zero
    expect(result.transfers.filter((t) => t.token === mint)).toHaveLength(0);
  });

  it('paired SOL transfer with null SOL price — usdValue is null on the matched leg', () => {
    // Covers the null branch of `solPriceUSD !== null ? ... : null` inside
    // the matched-pair path of the SOL pairing logic.
    const FEE = 5_000;
    const TRANSFER = 50_000_000;
    const bundle = mockRPCBundle({
      preBalances: [1_000_000_000, 200_000_000],
      postBalances: [1_000_000_000 - TRANSFER - FEE, 200_000_000 + TRANSFER],
      fee: FEE,
      preTokenBalances: [],
      postTokenBalances: [],
    });

    const result = analyzeCosts(bundle, null, 0);

    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].from).toBeTruthy();
    expect(result.transfers[0].to).toBeTruthy();
    expect(result.transfers[0].usdValue).toBeNull();
  });

  it('two outflows competing for one inflow — second outflow falls through to unmatched', () => {
    // Covers the `consumedInflows.has(k)` continue-branch in the pairing loop.
    const FEE = 5_000;
    const bundle = mockRPCBundle({
      // account[0] (fee payer) sends 100; account[1] also "sends" 100; only
      // account[2] receives 100. After greedy matching, the second outflow
      // has no inflow left and lands in the unmatched-outflow branch.
      preBalances: [1_000_000_000, 500_000_000, 0],
      postBalances: [1_000_000_000 - 100 - FEE, 500_000_000 - 100, 100],
      fee: FEE,
      preTokenBalances: [],
      postTokenBalances: [],
      accountKeys: [
        'PayerAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'OtherSenderbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        'Recipientccccccccccccccccccccccccccccccccccc',
      ],
    });

    const result = analyzeCosts(bundle, 150, 0);

    // 1 paired transfer + 1 unmatched outflow
    const paired = result.transfers.filter((t) => t.from && t.to);
    const unmatched = result.transfers.filter((t) => t.from && !t.to);
    expect(paired).toHaveLength(1);
    expect(unmatched).toHaveLength(1);
  });

  it('handles undefined fee with non-empty preBalances — txFee falls back to 0', () => {
    // Covers the `bundle.fee ?? 0` null branch inside the SOL pairing block.
    const bundle = mockRPCBundle({
      preBalances: [1_000_000_000, 0],
      postBalances: [900_000_000, 100_000_000],
      fee: undefined as unknown as number, // forces ?? 0 fallback
      preTokenBalances: [],
      postTokenBalances: [],
    });

    const result = analyzeCosts(bundle, 150, 0);

    // No fee adjustment applied (txFee = 0); pairing should still match the
    // 100M outflow with the 100M inflow.
    expect(result.transfers).toHaveLength(1);
    expect(result.transfers[0].uiAmount).toBeCloseTo(0.1, 9);
  });

  it('handles undefined computeUnitsConsumed and fee — falls back to 0', () => {
    // Covers `bundle.computeUnitsConsumed ?? 0` and `bundle.fee ?? 0` branches.
    const bundle = mockRPCBundle({
      computeUnitsConsumed: undefined as unknown as number,
      fee: undefined as unknown as number,
      preBalances: [],
      postBalances: [],
      preTokenBalances: [],
      postTokenBalances: [],
    });

    const result = analyzeCosts(bundle, 150, 0);

    expect(result.cuCost.cuConsumed).toBe(0);
    expect(result.cuCost.feeLamports).toBe(0);
    expect(result.cuCost.priorityFeeLamports).toBe(0);
    expect(result.cuCost.baseFeeLamports).toBe(0);
    expect(result.cuCost.microLamportsPerCU).toBe(0);
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
