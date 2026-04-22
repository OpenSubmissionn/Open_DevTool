import { RawTransactionBundle } from '../solana/rpc';
import { AnalyzedTransaction, ParsedLogs, CUProfile, CPITree, AccountDiff } from './types';
import { parseTransaction } from './txParser';

export function mergeAnalysis(
  bundle: RawTransactionBundle,
  logs: ParsedLogs,
  cuProfile: CUProfile,
  cpiTree: CPITree,
  accountDiffs: AccountDiff[],
  logs: ParsedLogs,
): AnalyzedTransaction {
  return {
    raw: {
      ...bundle,
      logMessages: bundle.logs ?? [],
      err: bundle.err ?? null,
      accountKeys: bundle.accountKeys ?? [],
    },
    parsed: parseTransaction(bundle),
    cuProfile,
    cpiTree,
    accountDiffs,
    logs,
    txType: undefined,
  };
}

