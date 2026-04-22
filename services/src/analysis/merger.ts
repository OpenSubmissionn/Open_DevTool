import { 
  RawTransactionBundle, 
  ParsedTransaction, 
  CUProfile, 
  CPITree, 
  AccountDiff, 
  ParsedLogs, 
  AnalyzedTransaction 
} from './types';

/**
 * Consolidates all analysis modules into a single unified AnalyzedTransaction object.
 * This acts as the final data structure that fuels the CLI renderers and the Insight Engine.
 */

export function mergeAnalysis(
  raw: RawTransactionBundle,
  parsed: ParsedTransaction,
  cuProfile: CUProfile,
  cpiTree: CPITree,
  accountDiffs: AccountDiff[],
  logs: ParsedLogs,
): AnalyzedTransaction {
  return {
    raw,
    parsed,
    cuProfile,
    cpiTree,
    accountDiffs,
    logs,
    // txType will be populated later by the Transaction Classifier (Task 2.5)
    txType: undefined 
  };
}

