import { calculateCUCostFromCU } from "./costAnalyzer";
import type { CUCost } from "./types";
import { getSolPriceUSD } from "../utils/priceCache";
import { RawTransactionBundle } from './types';
import { AnalyzedTransaction, ParsedLogs, CUProfile, CPITree, AccountDiff } from './types';
import { parseTransaction } from './txParser';

export async function mergeAnalysis(
  bundle: RawTransactionBundle,
  logs: ParsedLogs,
  cuProfile: CUProfile,
  cpiTree: CPITree,
  accountDiffs: AccountDiff[],
): Promise<AnalyzedTransaction> {
  const parsed = await parseTransaction(bundle);

  // Calculate CU cost (Task 3.6.2)
  let cuCost: CUCost | undefined;

  try {
    const cuConsumed = cuProfile?.totalConsumed || 0;
    const solPriceUSD = await getSolPriceUSD();

    if (cuConsumed > 0) {
      console.log("[Merger] Calculating CU cost...");
      cuCost = await calculateCUCostFromCU(cuConsumed, 1000, solPriceUSD);
      console.log("[Merger] CU cost calculated");
    } else {
      console.log("[Merger] No CU to calculate cost");
    }
  } catch (error) {
    console.warn("[Merger] CU cost calculation failed:", error);
    cuCost = undefined; // Fallback
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
  };
}