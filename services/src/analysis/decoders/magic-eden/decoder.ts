import type { DecodedAnchorInstruction } from '../anchor-idl.js';
import { decodeAnchorInstruction } from '../anchor-idl.js';
import type { ParsedInstruction } from '../../types.js';
import { MAGIC_EDEN_IDL, MAGIC_EDEN_PROGRAM_ID } from './idl.js';

export interface MagicEdenDecodedInstruction extends DecodedAnchorInstruction {
  price?: bigint;
  tokenSize?: bigint;
}

const MAGIC_EDEN_SEMANTIC_MAP: Record<string, { type: string; action: string }> = {
  sell: { type: 'nft_listing', action: 'list' },
  buy: { type: 'nft_offer', action: 'offer' },
  executeSale: { type: 'nft_trade', action: 'purchase' },
  cancel: { type: 'nft_cancel', action: 'cancel' },
  deposit: { type: 'nft_escrow', action: 'deposit' },
  withdraw: { type: 'nft_escrow', action: 'withdraw' },
};

export function decodeMagicEdenInstruction(
  ix: ParsedInstruction
): MagicEdenDecodedInstruction | null {
  const base = decodeAnchorInstruction(MAGIC_EDEN_PROGRAM_ID, ix, MAGIC_EDEN_IDL);
  if (!base) {
    return null;
  }

  const semantic = MAGIC_EDEN_SEMANTIC_MAP[base.instructionName];
  if (!semantic) {
    return {
      ...base,
      decoderWarning: base.decoderWarning ?? 'unrecognized Magic Eden instruction',
      confidence: 'low',
    };
  }

  const result: MagicEdenDecodedInstruction = {
    ...base,
    type: semantic.type,
    action: semantic.action,
  };

  const buyerPrice = base.decodedData?.buyer_price;
  if (buyerPrice !== undefined && buyerPrice !== null) {
    result.price = BigInt(String(buyerPrice));
  }

  const tokenSize = base.decodedData?.token_size;
  if (tokenSize !== undefined && tokenSize !== null) {
    result.tokenSize = BigInt(String(tokenSize));
  }

  return result;
}
