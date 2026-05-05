import { describe, it, expect, vi } from 'vitest';
import { ComputeBudgetProgram, PublicKey } from '@solana/web3.js';
import { mergeAnalysis } from '../../src/analysis/merger';
import { mockRPCBundle } from '../setup';

const COMPUTE_BUDGET_PROGRAM_ID = 'ComputeBudget111111111111111111111111111111';

const baseLogs = { byProgram: {}, errors: [], totalLines: 4 };
const baseCpiTree = { root: [], totalDepth: 0, nodeCount: 0 };
const cuProfileWith = (totalConsumed: number) => ({
  totalConsumed,
  totalLimit: 200_000,
  utilizationPercent: 1.5,
  perInstruction: [],
  bottleneck: null,
});

describe('mergeAnalysis', () => {
  it('should merge analysis into AnalyzedTransaction', async () => {
    const bundle = mockRPCBundle();
    const result = await mergeAnalysis(
      bundle,
      baseLogs,
      cuProfileWith(3000),
      baseCpiTree,
      []
    );

    expect(result.raw.signature).toBe('mockSignature123');
    expect(result.cuProfile.totalConsumed).toBeGreaterThanOrEqual(0);
  });

  // ─── extractMicroLamportsPerCU coverage ────────────────────────────────────
  // The function lives in merger.ts; these tests reach it through the public
  // mergeAnalysis entry point. Each test exercises a different code path.

  it('extracts microLamportsPerCU from a pre-parsed ComputeBudget instruction', async () => {
    const bundle = mockRPCBundle({
      rawResponse: {
        transaction: {
          message: {
            instructions: [
              {
                programId: { toString: () => COMPUTE_BUDGET_PROGRAM_ID },
                parsed: { info: { microLamports: 7_500 } },
              },
            ],
          },
        },
      } as any,
      computeUnitsConsumed: 100_000,
      fee: 5_750, // 5000 base + 750 priority (100k CU × 7500 µL/CU / 1e6)
    });

    const result = await mergeAnalysis(
      bundle,
      baseLogs,
      cuProfileWith(100_000),
      baseCpiTree,
      [],
      150
    );

    expect(result.cuCost?.microLamportsPerCU).toBe(7_500);
    expect(result.cuCost?.priorityFeeLamports).toBe(750);
  });

  it('decodes microLamportsPerCU from raw base64 instruction data when not pre-parsed', async () => {
    const ix = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 12_345 });
    const dataB64 = ix.data.toString('base64');

    const bundle = mockRPCBundle({
      rawResponse: {
        transaction: {
          message: {
            instructions: [
              {
                programId: new PublicKey(COMPUTE_BUDGET_PROGRAM_ID),
                data: dataB64, // raw — no `parsed` field
              },
            ],
          },
        },
      } as any,
      computeUnitsConsumed: 200_000,
      fee: 5_000 + Math.floor((200_000 * 12_345) / 1_000_000),
    });

    const result = await mergeAnalysis(
      bundle,
      baseLogs,
      cuProfileWith(200_000),
      baseCpiTree,
      [],
      150
    );

    expect(result.cuCost?.microLamportsPerCU).toBe(12_345);
  });

  it('falls back to back-derivation when ComputeBudget instruction data is malformed', async () => {
    // Invalid base64 and no `parsed` field → decode throws → returns 0.
    // Then analyzeCosts back-derives the price from bundle.fee.
    const bundle = mockRPCBundle({
      rawResponse: {
        transaction: {
          message: {
            instructions: [
              {
                programId: { toString: () => COMPUTE_BUDGET_PROGRAM_ID },
                data: 'not-valid-base64-!!!',
              },
            ],
          },
        },
      } as any,
      computeUnitsConsumed: 50_000,
      fee: 7_500, // 5000 base + 2500 priority
    });

    const result = await mergeAnalysis(
      bundle,
      baseLogs,
      cuProfileWith(50_000),
      baseCpiTree,
      [],
      150
    );

    expect(result.cuCost?.priorityFeeLamports).toBe(2_500);
    // Back-derived from actual priority paid
    expect(result.cuCost?.microLamportsPerCU).toBe(
      Math.round((2_500 * 1_000_000) / 50_000)
    );
  });

  it('skips non-ComputeBudget instructions when extracting price', async () => {
    const bundle = mockRPCBundle({
      rawResponse: {
        transaction: {
          message: {
            instructions: [
              {
                programId: { toString: () => '11111111111111111111111111111111' },
                parsed: { info: { microLamports: 999_999 } }, // not ComputeBudget — must be ignored
              },
            ],
          },
        },
      } as any,
      computeUnitsConsumed: 50_000,
      fee: 5_000, // base only — no priority
    });

    const result = await mergeAnalysis(
      bundle,
      baseLogs,
      cuProfileWith(50_000),
      baseCpiTree,
      [],
      150
    );

    expect(result.cuCost?.priorityFeeLamports).toBe(0);
    expect(result.cuCost?.microLamportsPerCU).toBe(0);
  });

  // ─── calculateCUCostFromCU fallback (lines 78-89) ──────────────────────────

  it('swallows SOL price lookup errors and continues with null price', async () => {
    // Covers the catch branch in merger.ts where getSolPriceUSD throws.
    // Reset modules first so the dynamic re-import picks up the new mock,
    // not the already-cached merger module.
    vi.resetModules();
    vi.doMock('../../src/utils/priceCache', () => ({
      getSolPriceUSD: vi.fn().mockRejectedValue(new Error('mocked price feed down')),
    }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { mergeAnalysis: mergeWithMock } = await import('../../src/analysis/merger');

    const bundle = mockRPCBundle({
      computeUnitsConsumed: 5_000,
      fee: 5_000,
    });

    const result = await mergeWithMock(
      bundle,
      baseLogs,
      cuProfileWith(5_000),
      baseCpiTree,
      [],
      {},
      null
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[Merger] SOL price lookup failed:',
      expect.any(Error)
    );
    expect(result.cuCost?.feeUSD).toBeNull();

    warnSpy.mockRestore();
    vi.doUnmock('../../src/utils/priceCache');
    vi.resetModules();
  });

  it('swallows CU-cost fallback calculation errors and continues', async () => {
    // Covers the catch in merger.ts line 89 — calculateCUCostFromCU throwing.
    // We mock costAnalyzer to make it throw so the path is exercised.
    vi.resetModules();
    vi.doMock('../../src/analysis/costAnalyzer', async () => {
      const actual = await vi.importActual<
        typeof import('../../src/analysis/costAnalyzer')
      >('../../src/analysis/costAnalyzer');
      return {
        ...actual,
        calculateCUCostFromCU: vi
          .fn()
          .mockRejectedValue(new Error('mocked fallback failure')),
      };
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { mergeAnalysis: mergeWithMock } = await import('../../src/analysis/merger');

    // Trigger the fallback: bundle has cuConsumed=0 but cuProfile.totalConsumed>0
    const bundle = mockRPCBundle({
      computeUnitsConsumed: 0,
      fee: 5_000,
    });

    const result = await mergeWithMock(
      bundle,
      baseLogs,
      cuProfileWith(50_000),
      baseCpiTree,
      [],
      {},
      150
    );

    expect(warnSpy).toHaveBeenCalledWith(
      '[Merger] CU cost fallback calculation failed:',
      expect.any(Error)
    );
    // Analysis still completes — cuCost is just not enriched by the fallback
    expect(result).toBeDefined();

    warnSpy.mockRestore();
    vi.doUnmock('../../src/analysis/costAnalyzer');
    vi.resetModules();
  });

  it('exits cleanly when both bundle CU and cuProfile.totalConsumed are 0', async () => {
    // Covers the false branch of `if (cuConsumed > 0)` and the `|| 0` fallback
    // of `cuProfile?.totalConsumed || 0` when there's nothing to compute.
    const bundle = mockRPCBundle({
      computeUnitsConsumed: 0,
      fee: 5_000,
    });

    const result = await mergeAnalysis(
      bundle,
      baseLogs,
      cuProfileWith(0), // totalConsumed = 0 → falsy
      baseCpiTree,
      [],
      {},
      150
    );

    // No fallback enrichment happened; cuCost retains the analyzeCosts output
    expect(result.cuCost?.cuConsumed).toBe(0);
  });

  it('falls back to CU-profile based calculation when bundle.computeUnitsConsumed is 0', async () => {
    // RPC didn't return computeUnitsConsumed but the log parser produced a
    // non-zero CU profile total. Merger should use the fallback path.
    const bundle = mockRPCBundle({
      computeUnitsConsumed: 0, // RPC absence
      fee: 5_500,
      preBalances: [1_000_005_500],
      postBalances: [1_000_000_000],
      preTokenBalances: [],
      postTokenBalances: [],
    });

    const result = await mergeAnalysis(
      bundle,
      baseLogs,
      cuProfileWith(75_000), // log-derived CU
      baseCpiTree,
      [],
      150
    );

    // Fallback path uses the log-derived total, not 0
    expect(result.cuCost?.cuConsumed).toBe(75_000);
    expect(result.cuCost?.feeLamports).toBe(5_500);
  });
});
