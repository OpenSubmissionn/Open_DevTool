import { RawTransactionBundle } from './types';
import { AnalyzedTransaction, ParsedLogs, CUProfile, CPITree, AccountDiff } from './types';
import { parseTransaction } from './txParser';

export function mergeAnalysis(
bundle: RawTransactionBundle,
logs: ParsedLogs,
cuProfile: CUProfile,
cpiTree: CPITree,
  accountDiffs: AccountDiff[],
): AnalyzedTransaction {
  const parsed = parseTransaction(bundle);

  return {
    signature: parsed.signature,
    success: parsed.success,
    raw: bundle,
    parsed,
    cuProfile,
    cpiTree,
    accountDiffs,
    logs,
  };
}