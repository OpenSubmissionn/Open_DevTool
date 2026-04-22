import { ParsedTransaction } from './types';

export type TxType =
  | 'swap'
  | 'transfer'
  | 'nft-mint'
  | 'stake'
  | 'governance-vote'
  | 'failed-tx'
  | 'high-CU'
  | 'deep-cpi'
  | 'multi-program'
  | 'unknown';

export function classifyTransaction(parsed: ParsedTransaction): TxType {
  if (parsed.success === false) {
    return 'failed-tx';
  }

  const allProgramIds = parsed.instructions.flatMap(inst => [
    inst.programId,
    ...inst.innerInstructions.flatMap(inner => inner.programId)
  ]);
  const uniqueProgramIds = [...new Set(allProgramIds)];

  if (uniqueProgramIds.some(id => id.toLowerCase().includes('whirlpool') || id.toLowerCase().includes('swap'))) {
    return 'swap';
  }

  if (uniqueProgramIds.some(id => id.toLowerCase().includes('dex') || id === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8')) {
    return 'swap';
  }

  if (uniqueProgramIds.length === 1 && uniqueProgramIds[0] === '11111111111111111111111111111111') {
    return 'transfer';
  }

  if (uniqueProgramIds.some(id => id.toLowerCase().includes('meta') || id.toLowerCase().includes('candy'))) {
    return 'nft-mint';
  }

  if (uniqueProgramIds.some(id => id.toLowerCase().includes('stake'))) {
    return 'stake';
  }

  if (uniqueProgramIds.some(id => id.toLowerCase().includes('gov') || id.toLowerCase().includes('vote'))) {
    return 'governance-vote';
  }

  if (uniqueProgramIds.length > 3) {
    return 'multi-program';
  }

  if (parsed.instructions.length > 5) {
    return 'high-CU';
  }

  const maxDepth = Math.max(...parsed.instructions.map(inst => inst.depth));
  const hasDeepInner = parsed.instructions.some(inst =>
    inst.innerInstructions.some(inner => inner.innerInstructions && inner.innerInstructions.length > 0)
  );
  if (maxDepth > 2 || hasDeepInner) {
    return 'deep-cpi';
  }

  return 'unknown';
}