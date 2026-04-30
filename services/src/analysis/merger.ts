import { ComputeBudgetInstruction, ComputeBudgetProgram } from '@solana/web3.js';
import { calculateCUCostFromCU } from './costAnalyzer';
import type { CUCost } from './types';
import { getSolPriceUSD } from '../utils/priceCache';
import { RawTransactionBundle } from './types';
import { AnalyzedTransaction, ParsedLogs, CUProfile, CPITree, AccountDiff } from './types';
import { parseTransaction } from './txParser';
import { IdlCache } from '../solana/idlcache';
import { analyzeCosts } from './costAnalyzer';

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
  const costAnalysis = analyzeCosts(bundle, solPriceUsd, microLamportsPerCU);

  let cuCost: CUCost | undefined;

  try {
    const cuConsumed = cuProfile?.totalConsumed || 0;
    const solPriceUSD = await getSolPriceUSD();

    if (cuConsumed > 0) {
      cuCost = await calculateCUCostFromCU(cuConsumed, 1000, solPriceUSD);
    }
  } catch (error) {
    console.warn('[Merger] CU cost calculation failed:', error);
  }

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
  };
}
