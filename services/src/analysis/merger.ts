import { RawTransactionBundle } from './types';
import { AnalyzedTransaction, ParsedLogs, CUProfile, CPITree, AccountDiff } from './types';
import { parseTransaction } from './txParser';

// Task 3.6.1: Fix async usage
// 1. Added 'async' keyword to the function definition.
// 2. Wrapped the return type in 'Promise<AnalyzedTransaction>' since it's now an async function.
export async function mergeAnalysis(
bundle: RawTransactionBundle,
logs: ParsedLogs,
cuProfile: CUProfile,
cpiTree: CPITree,
  accountDiffs: AccountDiff[],
): Promise<AnalyzedTransaction> {
  
  // 3. Added 'await' to correctly resolve the promise from parseTransaction.
  // This fixes the type errors on 'parsed.signature' and 'parsed.success' 
  // because 'parsed' is now the actual object, not a pending Promise.
  const parsed = await parseTransaction(bundle);

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