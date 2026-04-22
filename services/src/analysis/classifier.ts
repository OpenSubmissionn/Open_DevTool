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

function getInstructionMaxDepth(instruction: ParsedTransaction['instructions'][number]): number {
  if (instruction.innerInstructions.length === 0) {
    return instruction.depth;
  }

  return instruction.innerInstructions.reduce(
    (maxDepth, childInstruction) => Math.max(maxDepth, getInstructionMaxDepth(childInstruction)),
    instruction.depth
  );
}

function getTransactionMaxDepth(instructions: ParsedTransaction['instructions']): number {
  return instructions.reduce((maxDepth, instruction) => Math.max(maxDepth, getInstructionMaxDepth(instruction)), 0);
}

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

  const maxDepth = getTransactionMaxDepth(parsed.instructions);
  if (maxDepth > 2) {
    return 'deep-cpi';
  }

  if (uniqueProgramIds.length > 3) {
    return 'multi-program';
  }

  if (parsed.instructions.length > 5) {
    return 'high-CU';
  }

  return 'unknown';
}