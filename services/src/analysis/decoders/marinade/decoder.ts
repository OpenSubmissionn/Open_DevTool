import type { DecodedAnchorInstruction } from '../anchor-idl';
import { decodeAnchorInstruction } from '../anchor-idl';
import type { ParsedInstruction } from '../../types';
import { MARINADE_IDL, MARINADE_PROGRAM_ID } from './idl';

export interface MarinadeDecodedInstruction extends DecodedAnchorInstruction {
  lamports?: bigint;
  msolAmount?: bigint;
}

const MARINADE_SEMANTIC_MAP: Record<string, { type: string; action: string }> = {
  deposit: { type: 'liquid_stake', action: 'stake' },
  depositStakeAccount: { type: 'liquid_stake', action: 'stake' },
  liquidUnstake: { type: 'liquid_unstake', action: 'unstake' },
  orderUnstake: { type: 'delayed_unstake', action: 'order' },
  claim: { type: 'unstake_claim', action: 'claim' },
  addLiquidity: { type: 'liquidity_pool', action: 'deposit' },
  removeLiquidity: { type: 'liquidity_pool', action: 'withdraw' },
};

export function decodeMarinadeInstruction(
  ix: ParsedInstruction
): MarinadeDecodedInstruction | null {
  const base = decodeAnchorInstruction(MARINADE_PROGRAM_ID, ix, MARINADE_IDL);
  if (!base) {
    return null;
  }

  const semantic = MARINADE_SEMANTIC_MAP[base.instructionName];
  if (!semantic) {
    return {
      ...base,
      decoderWarning: base.decoderWarning ?? 'unrecognized Marinade instruction',
      confidence: 'low',
    };
  }

  const result: MarinadeDecodedInstruction = {
    ...base,
    type: semantic.type,
    action: semantic.action,
  };

  const lamports = base.decodedData?.lamports;
  if (lamports !== undefined && lamports !== null) {
    result.lamports = BigInt(String(lamports));
  }

  const msolAmount = base.decodedData?.msol_amount;
  if (msolAmount !== undefined && msolAmount !== null) {
    result.msolAmount = BigInt(String(msolAmount));
  }

  return result;
}
