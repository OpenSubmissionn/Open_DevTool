import { RawTransactionBundle } from './types';
import { AnalyzedTransaction, ParsedLogs, CUProfile, CPITree, AccountDiff } from './types';
import { parseTransaction } from './txParser';
import { IdlCache } from '../solana/idlCache';

export interface MergeOptions {
  idlCache?: IdlCache;
  anchorProvider?: any; 
}

export async function mergeAnalysis(
  bundle: RawTransactionBundle,
  logs: ParsedLogs,
  cuProfile: CUProfile,
  cpiTree: CPITree,
  accountDiffs: AccountDiff[],
  options: MergeOptions = {}, 
): Promise<AnalyzedTransaction> {
  
  const parsed = await parseTransaction(bundle, {
    idlCache: options.idlCache,
    anchorProvider: options.anchorProvider,
  });

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