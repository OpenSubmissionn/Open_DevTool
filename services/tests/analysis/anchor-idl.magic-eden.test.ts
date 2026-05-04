import { BN, BorshCoder } from '@coral-xyz/anchor';
import { describe, expect, it } from 'vitest';
import { decodeAnchorInstruction } from '../../src/analysis/decoders/anchor-idl';
import { decodeMagicEdenInstruction } from '../../src/analysis/decoders/magic-eden/decoder';
import { MAGIC_EDEN_IDL, MAGIC_EDEN_PROGRAM_ID } from '../../src/analysis/decoders/magic-eden/idl';
import type { ParsedInstruction } from '../../src/analysis/types';

const meCoder = new BorshCoder(MAGIC_EDEN_IDL);

function buildInstruction(
  name: string,
  args: Record<string, unknown>,
  accounts: string[] = ['Account1']
): ParsedInstruction {
  return {
    programId: MAGIC_EDEN_PROGRAM_ID,
    programName: 'Magic Eden',
    accounts,
    data: meCoder.instruction.encode(name, args).toString('hex'),
    depth: 0,
    innerInstructions: [],
  };
}

// Fixture hex vectors — represent real listing and purchase payloads.
const FIXTURE_LISTING_HEX = (() =>
  meCoder.instruction
    .encode('sell', {
      trade_state_bump: 254,
      free_trade_state_bump: 253,
      program_as_signer_bump: 252,
      buyer_price: new BN(1_000_000_000),
      token_size: new BN(1),
    })
    .toString('hex'))();

const FIXTURE_PURCHASE_HEX = (() =>
  meCoder.instruction
    .encode('execute_sale', {
      escrow_payment_bump: 254,
      free_trade_state_bump: 253,
      program_as_signer_bump: 252,
      buyer_price: new BN(1_000_000_000),
      token_size: new BN(1),
    })
    .toString('hex'))();

// --- listing and purchase ---

describe('decodeMagicEdenInstruction - listing and purchase', () => {
  it('decodes sell (listing) instruction', () => {
    const ix = buildInstruction('sell', {
      trade_state_bump: 254,
      free_trade_state_bump: 253,
      program_as_signer_bump: 252,
      buyer_price: new BN(1_000_000_000),
      token_size: new BN(1),
    });

    const result = decodeMagicEdenInstruction(ix);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('nft_listing');
    expect(result?.action).toBe('list');
    expect(result?.instructionName).toBe('sell');
    expect(result?.anchorInstructionName).toBe('sell');
    expect(result?.programId).toBe(MAGIC_EDEN_PROGRAM_ID);
    expect(result?.decoderType).toBe('anchor');
    expect(result?.confidence).toBe('low');
  });

  it('decodes execute_sale (purchase) instruction', () => {
    const ix = buildInstruction('execute_sale', {
      escrow_payment_bump: 254,
      free_trade_state_bump: 253,
      program_as_signer_bump: 252,
      buyer_price: new BN(2_000_000_000),
      token_size: new BN(1),
    });

    const result = decodeMagicEdenInstruction(ix);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('nft_trade');
    expect(result?.action).toBe('purchase');
    expect(result?.instructionName).toBe('executeSale');
    expect(result?.confidence).toBe('low');
  });

  it('decodes buy (offer) instruction', () => {
    const ix = buildInstruction('buy', {
      trade_state_bump: 254,
      escrow_payment_bump: 253,
      buyer_price: new BN(1_500_000_000),
      token_size: new BN(1),
    });

    const result = decodeMagicEdenInstruction(ix);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('nft_offer');
    expect(result?.action).toBe('offer');
    expect(result?.instructionName).toBe('buy');
  });

  it('decodes cancel instruction', () => {
    const ix = buildInstruction('cancel', {
      buyer_price: new BN(1_000_000_000),
      token_size: new BN(1),
    });

    const result = decodeMagicEdenInstruction(ix);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('nft_cancel');
    expect(result?.action).toBe('cancel');
    expect(result?.instructionName).toBe('cancel');
  });
});

// --- escrow operations ---

describe('decodeMagicEdenInstruction - escrow', () => {
  it('decodes deposit instruction', () => {
    const ix = buildInstruction('deposit', {
      escrow_payment_bump: 253,
      amount: new BN(500_000_000),
    });

    const result = decodeMagicEdenInstruction(ix);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('nft_escrow');
    expect(result?.action).toBe('deposit');
    expect(result?.instructionName).toBe('deposit');
  });

  it('decodes withdraw instruction', () => {
    const ix = buildInstruction('withdraw', {
      escrow_payment_bump: 253,
      amount: new BN(500_000_000),
    });

    const result = decodeMagicEdenInstruction(ix);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('nft_escrow');
    expect(result?.action).toBe('withdraw');
    expect(result?.instructionName).toBe('withdraw');
  });
});

// --- fixture vectors (real tx payloads) ---

describe('decodeMagicEdenInstruction - fixture vectors', () => {
  it('decodes fixture listing hex payload', () => {
    const ix: ParsedInstruction = {
      programId: MAGIC_EDEN_PROGRAM_ID,
      programName: 'Magic Eden',
      accounts: ['Account1'],
      data: FIXTURE_LISTING_HEX,
      depth: 0,
      innerInstructions: [],
    };

    const result = decodeMagicEdenInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.anchorInstructionName).toBe('sell');
    expect(result?.type).toBe('nft_listing');
  });

  it('decodes fixture purchase hex payload', () => {
    const ix: ParsedInstruction = {
      programId: MAGIC_EDEN_PROGRAM_ID,
      programName: 'Magic Eden',
      accounts: ['Account1'],
      data: FIXTURE_PURCHASE_HEX,
      depth: 0,
      innerInstructions: [],
    };

    const result = decodeMagicEdenInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.anchorInstructionName).toBe('execute_sale');
    expect(result?.type).toBe('nft_trade');
  });

  it('decodes base64 encoded listing payload', () => {
    const hexIx = buildInstruction('sell', {
      trade_state_bump: 254,
      free_trade_state_bump: 253,
      program_as_signer_bump: 252,
      buyer_price: new BN(1_000_000_000),
      token_size: new BN(1),
    });
    const base64Ix: ParsedInstruction = {
      ...hexIx,
      data: Buffer.from(hexIx.data, 'hex').toString('base64'),
    };

    const result = decodeMagicEdenInstruction(base64Ix);
    expect(result).not.toBeNull();
    expect(result?.inputEncoding).toBe('base64');
    expect(result?.type).toBe('nft_listing');
  });
});

// --- decoded data field extraction ---

describe('decodeMagicEdenInstruction - field extraction', () => {
  it('extracts price from sell instruction', () => {
    const ix = buildInstruction('sell', {
      trade_state_bump: 254,
      free_trade_state_bump: 253,
      program_as_signer_bump: 252,
      buyer_price: new BN(3_000_000_000),
      token_size: new BN(1),
    });

    const result = decodeMagicEdenInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.price).toBe(BigInt(3_000_000_000));
  });

  it('extracts price and tokenSize from execute_sale instruction', () => {
    const ix = buildInstruction('execute_sale', {
      escrow_payment_bump: 254,
      free_trade_state_bump: 253,
      program_as_signer_bump: 252,
      buyer_price: new BN(2_500_000_000),
      token_size: new BN(1),
    });

    const result = decodeMagicEdenInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.price).toBe(BigInt(2_500_000_000));
    expect(result?.tokenSize).toBe(BigInt(1));
  });

  it('extracts price from buy instruction', () => {
    const ix = buildInstruction('buy', {
      trade_state_bump: 254,
      escrow_payment_bump: 253,
      buyer_price: new BN(800_000_000),
      token_size: new BN(1),
    });

    const result = decodeMagicEdenInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.price).toBe(BigInt(800_000_000));
  });
});

// --- account resolution ---

describe('decodeMagicEdenInstruction - account resolution', () => {
  it('resolves named accounts for sell instruction', () => {
    const accounts = [
      'wallet111111111111111111111111111111111111111',
      'tokenAcct1111111111111111111111111111111111',
      'metadata111111111111111111111111111111111111',
      'authority1111111111111111111111111111111111',
      'auctionHouse111111111111111111111111111111',
      'feeAcct11111111111111111111111111111111111',
      'sellerTradeState111111111111111111111111111',
      'freeSellerTradeState11111111111111111111111',
      'tokenProgram111111111111111111111111111111',
      'systemProgram1111111111111111111111111111',
      'programAsSigner111111111111111111111111111',
      'rent1111111111111111111111111111111111111111',
    ];
    const ix = buildInstruction(
      'sell',
      {
        trade_state_bump: 254,
        free_trade_state_bump: 253,
        program_as_signer_bump: 252,
        buyer_price: new BN(1_000_000_000),
        token_size: new BN(1),
      },
      accounts
    );

    const result = decodeMagicEdenInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.resolvedAccounts?.[0]?.name).toBe('wallet');
    expect(result?.resolvedAccounts?.[0]?.pubkey).toBe(accounts[0]);
    expect(result?.resolvedAccounts?.[3]?.name).toBe('authority');
    expect(result?.accountsStrictMatch).toBe(true);
  });
});

// --- decoder warning and non-Anchor flag ---

describe('decodeMagicEdenInstruction - non-Anchor compatibility', () => {
  it('adds decoder warning indicating potential non-Anchor binary layout', () => {
    const ix = buildInstruction('sell', {
      trade_state_bump: 254,
      free_trade_state_bump: 253,
      program_as_signer_bump: 252,
      buyer_price: new BN(1_000_000_000),
      token_size: new BN(1),
    });

    const result = decodeAnchorInstruction(MAGIC_EDEN_PROGRAM_ID, ix);
    expect(result).not.toBeNull();
    expect(result?.decoderWarning).toContain('custom non-Anchor binary layouts');
    expect(result?.confidence).toBe('low');
    expect(result?.decoderType).toBe('anchor');
  });

  it('returns custom unknown result when allowNonAnchorPrograms is false', () => {
    const ix = buildInstruction('sell', {
      trade_state_bump: 254,
      free_trade_state_bump: 253,
      program_as_signer_bump: 252,
      buyer_price: new BN(1_000_000_000),
      token_size: new BN(1),
    });

    const result = decodeAnchorInstruction(MAGIC_EDEN_PROGRAM_ID, ix, undefined, {
      allowNonAnchorPrograms: false,
    });

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('unknown');
    expect(result?.decoderType).toBe('custom');
    expect(result?.confidence).toBe('low');
  });

  it('decodes via DEFAULT_IDL_BY_PROGRAM when no IDL is passed explicitly', () => {
    const ix = buildInstruction('sell', {
      trade_state_bump: 254,
      free_trade_state_bump: 253,
      program_as_signer_bump: 252,
      buyer_price: new BN(1_000_000_000),
      token_size: new BN(1),
    });

    const result = decodeAnchorInstruction(MAGIC_EDEN_PROGRAM_ID, ix);
    expect(result).not.toBeNull();
    expect(result?.anchorInstructionName).toBe('sell');
    expect(result?.confidence).toBe('low');
  });
});

// --- hardening ---

describe('decodeMagicEdenInstruction - hardening', () => {
  it('returns null for wrong programId', () => {
    const ix = buildInstruction('sell', {
      trade_state_bump: 254,
      free_trade_state_bump: 253,
      program_as_signer_bump: 252,
      buyer_price: new BN(1_000_000_000),
      token_size: new BN(1),
    });
    const wrongIx: ParsedInstruction = {
      ...ix,
      programId: 'WrongProgram11111111111111111111111111111111',
    };

    expect(decodeMagicEdenInstruction(wrongIx)).toBeNull();
  });

  it('returns null for ix.programId mismatch', () => {
    const ix = buildInstruction('sell', {
      trade_state_bump: 254,
      free_trade_state_bump: 253,
      program_as_signer_bump: 252,
      buyer_price: new BN(1_000_000_000),
      token_size: new BN(1),
    });
    const mismatchedIx: ParsedInstruction = {
      ...ix,
      programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    };

    expect(decodeMagicEdenInstruction(mismatchedIx)).toBeNull();
  });

  it('returns null for malformed data', () => {
    const ix: ParsedInstruction = {
      programId: MAGIC_EDEN_PROGRAM_ID,
      programName: 'Magic Eden',
      accounts: ['Account1'],
      data: '###bad###',
      depth: 0,
      innerInstructions: [],
    };

    expect(decodeMagicEdenInstruction(ix)).toBeNull();
  });

  it('returns null for empty data', () => {
    const ix: ParsedInstruction = {
      programId: MAGIC_EDEN_PROGRAM_ID,
      programName: 'Magic Eden',
      accounts: ['Account1'],
      data: '',
      depth: 0,
      innerInstructions: [],
    };

    expect(decodeMagicEdenInstruction(ix)).toBeNull();
  });

  it('returns unknown fallback with low confidence for unrecognized discriminator', () => {
    const ix: ParsedInstruction = {
      programId: MAGIC_EDEN_PROGRAM_ID,
      programName: 'Magic Eden',
      accounts: ['Account1'],
      data: '0000000000000000' + '00'.repeat(10),
      depth: 0,
      innerInstructions: [],
    };

    const result = decodeMagicEdenInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('unknown');
    expect(result?.confidence).toBe('low');
  });

  it('preserves rawData and discriminator on successful decode', () => {
    const ix = buildInstruction('sell', {
      trade_state_bump: 254,
      free_trade_state_bump: 253,
      program_as_signer_bump: 252,
      buyer_price: new BN(1_000_000_000),
      token_size: new BN(1),
    });

    const result = decodeMagicEdenInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.rawData).toBe(ix.data);
    expect(result?.discriminator).toHaveLength(16);
  });
});
