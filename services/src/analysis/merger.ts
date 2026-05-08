import { ComputeBudgetInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { calculateCUCostFromCU } from './costAnalyzer.js';
import type { CUCost } from './types.js';
import { getSolPriceUSD } from '../utils/priceCache.js';
import { RawTransactionBundle } from './types.js';
import { AnalyzedTransaction, ParsedLogs, CUProfile, CPITree, AccountDiff } from './types.js';
import { parseTransaction } from './txParser.js';
import { IdlCache } from '../solana/idlcache.js';
import { analyzeCosts } from './costAnalyzer.js';
import { detectAnomalies } from './anomalyDetector.js';

export interface MergeOptions {
  idlCache?: IdlCache;
  anchorProvider?: any;
}

function extractMicroLamportsPerCU(bundle: RawTransactionBundle): number {
  const instructions = (bundle.rawResponse?.transaction as any)?.message?.instructions ?? [];

  for (const ix of instructions) {
    if (ix?.programId?.toString() !== 'ComputeBudget111111111111111111111111111111') continue;

    const price = ix?.parsed?.info?.microLamports;
    if (typeof price === 'number' && price >= 0) return price;

    try {
      const decoded = ComputeBudgetInstruction.decodeSetComputeUnitPrice({
        programId: ComputeBudgetProgram.programId,
        keys: [],
        data: Buffer.from(ix.data, 'base64'),
      });
      return Number(decoded.microLamports);
    } catch {
      continue;
    }
  }

  return 0;
}

export async function mergeAnalysis(
  bundle: RawTransactionBundle,
  logs: ParsedLogs,
  cuProfile: CUProfile,
  cpiTree: CPITree,
  accountDiffs: AccountDiff[],
  options: MergeOptions = {},
  solPriceUsd: number | null = null
): Promise<AnalyzedTransaction> {
  const parsed = await parseTransaction(bundle, {
    idlCache: options.idlCache,
    anchorProvider: options.anchorProvider,
  });

  const microLamportsPerCU = extractMicroLamportsPerCU(bundle);

  // Resolve a SOL price up front so transfer USD values *and* feeUSD share the
  // same source. CLI callers don't pass a price explicitly, so without this the
  // analyzer would render "USD N/A" even though the price cache has a value.
  let resolvedSolPriceUsd = solPriceUsd;
  if (resolvedSolPriceUsd === null) {
    try {
      resolvedSolPriceUsd = await getSolPriceUSD();
    } catch (error) {
      console.warn('[Merger] SOL price lookup failed:', error);
    }
  }

  const costAnalysis = analyzeCosts(bundle, resolvedSolPriceUsd, microLamportsPerCU);

  // Prefer the cost panel computed by analyzeCosts — it uses the canonical
  // bundle.computeUnitsConsumed (matches Solscan) and bundle.fee (true total).
  // Fall back to a CU-only calculation when the RPC didn't return computeUnits
  // but the log-derived profiler still produced a non-zero total.
  let cuCost: CUCost | undefined = costAnalysis.cuCost;

  if (!cuCost || cuCost.cuConsumed === 0) {
    try {
      const cuConsumed = cuProfile?.totalConsumed || 0;
      if (cuConsumed > 0) {
        cuCost = await calculateCUCostFromCU(
          cuConsumed,
          microLamportsPerCU,
          resolvedSolPriceUsd,
          bundle.fee
        );
      }
    } catch (error) {
      console.warn('[Merger] CU cost fallback calculation failed:', error);
    }
  }

  const anomalies = detectAnomalies(bundle, costAnalysis.transfers);

  return {
    signature: parsed.signature,
    success: parsed.success,
    raw: bundle,
    parsed,
    cuProfile,
    cpiTree,
    accountDiffs,
    logs,
    cuCost,
    transfers: costAnalysis.transfers,
    anomalies,
  };
}
