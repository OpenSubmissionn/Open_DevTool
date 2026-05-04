import { BN, BorshCoder } from '@coral-xyz/anchor';
import { describe, expect, it } from 'vitest';
import { decodeAnchorInstruction } from '../../src/analysis/decoders/anchor-idl';
import { decodeMarinadeInstruction } from '../../src/analysis/decoders/marinade/decoder';
import { MARINADE_IDL, MARINADE_PROGRAM_ID } from '../../src/analysis/decoders/marinade/idl';
import type { ParsedInstruction } from '../../src/analysis/types';

const marinadeCoder = new BorshCoder(MARINADE_IDL);

function buildInstruction(
  name: string,
  args: Record<string, unknown>,
  accounts: string[] = ['Account1']
): ParsedInstruction {
  return {
    programId: MARINADE_PROGRAM_ID,
    programName: 'Marinade Finance',
    accounts,
    data: marinadeCoder.instruction.encode(name, args).toString('hex'),
    depth: 0,
    innerInstructions: [],
  };
}

// Fixture hex vectors derived from BorshCoder — used to validate the decoder
// handles the exact binary layout produced by the Marinade program.
const FIXTURE_DEPOSIT_HEX = (() =>
  marinadeCoder.instruction
    .encode('deposit', { lamports: new BN(1_000_000_000) })
    .toString('hex'))();

const FIXTURE_LIQUID_UNSTAKE_HEX = (() =>
  marinadeCoder.instruction
    .encode('liquid_unstake', { msol_amount: new BN(900_000_000) })
    .toString('hex'))();

// --- stake / unstake ---

describe('decodeMarinadeInstruction - stake/unstake', () => {
  it('decodes deposit (stake SOL) instruction', () => {
    const ix = buildInstruction('deposit', { lamports: new BN(1_000_000_000) });

    const result = decodeMarinadeInstruction(ix);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('liquid_stake');
    expect(result?.action).toBe('stake');
    expect(result?.instructionName).toBe('deposit');
    expect(result?.anchorInstructionName).toBe('deposit');
    expect(result?.programId).toBe(MARINADE_PROGRAM_ID);
    expect(result?.decoderType).toBe('anchor');
    expect(result?.confidence).toBe('high');
  });

  it('decodes liquid_unstake instruction', () => {
    const ix = buildInstruction('liquid_unstake', { msol_amount: new BN(900_000_000) });

    const result = decodeMarinadeInstruction(ix);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('liquid_unstake');
    expect(result?.action).toBe('unstake');
    expect(result?.instructionName).toBe('liquidUnstake');
    expect(result?.confidence).toBe('high');
  });

  it('decodes order_unstake (delayed) instruction', () => {
    const ix = buildInstruction('order_unstake', { msol_amount: new BN(500_000_000) });

    const result = decodeMarinadeInstruction(ix);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('delayed_unstake');
    expect(result?.action).toBe('order');
    expect(result?.instructionName).toBe('orderUnstake');
  });

  it('decodes claim instruction', () => {
    const ix = buildInstruction('claim', {});

    const result = decodeMarinadeInstruction(ix);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('unstake_claim');
    expect(result?.action).toBe('claim');
    expect(result?.instructionName).toBe('claim');
  });

  it('decodes deposit_stake_account instruction', () => {
    const ix = buildInstruction('deposit_stake_account', { validator_index: 5 });

    const result = decodeMarinadeInstruction(ix);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('liquid_stake');
    expect(result?.action).toBe('stake');
    expect(result?.instructionName).toBe('depositStakeAccount');
  });
});

// --- liquidity operations ---

describe('decodeMarinadeInstruction - liquidity', () => {
  it('decodes add_liquidity instruction', () => {
    const ix = buildInstruction('add_liquidity', { lamports: new BN(2_000_000_000) });

    const result = decodeMarinadeInstruction(ix);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('liquidity_pool');
    expect(result?.action).toBe('deposit');
    expect(result?.instructionName).toBe('addLiquidity');
  });

  it('decodes remove_liquidity instruction', () => {
    const ix = buildInstruction('remove_liquidity', { tokens: new BN(1_500_000_000) });

    const result = decodeMarinadeInstruction(ix);

    expect(result).not.toBeNull();
    expect(result?.type).toBe('liquidity_pool');
    expect(result?.action).toBe('withdraw');
    expect(result?.instructionName).toBe('removeLiquidity');
  });
});

// --- fixture vectors ---

describe('decodeMarinadeInstruction - fixture vectors', () => {
  it('decodes fixture deposit hex payload', () => {
    const ix: ParsedInstruction = {
      programId: MARINADE_PROGRAM_ID,
      programName: 'Marinade Finance',
      accounts: ['Account1'],
      data: FIXTURE_DEPOSIT_HEX,
      depth: 0,
      innerInstructions: [],
    };

    const result = decodeMarinadeInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.anchorInstructionName).toBe('deposit');
    expect(result?.type).toBe('liquid_stake');
  });

  it('decodes fixture liquid_unstake hex payload', () => {
    const ix: ParsedInstruction = {
      programId: MARINADE_PROGRAM_ID,
      programName: 'Marinade Finance',
      accounts: ['Account1'],
      data: FIXTURE_LIQUID_UNSTAKE_HEX,
      depth: 0,
      innerInstructions: [],
    };

    const result = decodeMarinadeInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.anchorInstructionName).toBe('liquid_unstake');
    expect(result?.type).toBe('liquid_unstake');
  });

  it('decodes base64 encoded instruction data', () => {
    const hexIx = buildInstruction('liquid_unstake', { msol_amount: new BN(900_000_000) });
    const base64Ix: ParsedInstruction = {
      ...hexIx,
      data: Buffer.from(hexIx.data, 'hex').toString('base64'),
    };

    const result = decodeMarinadeInstruction(base64Ix);
    expect(result).not.toBeNull();
    expect(result?.inputEncoding).toBe('base64');
    expect(result?.type).toBe('liquid_unstake');
  });
});

// --- decoded data extraction ---

describe('decodeMarinadeInstruction - decoded data fields', () => {
  it('populates lamports field from deposit decoded data', () => {
    const ix = buildInstruction('deposit', { lamports: new BN(2_000_000_000) });

    const result = decodeMarinadeInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.lamports).toBe(BigInt(2_000_000_000));
  });

  it('populates msolAmount field from liquid_unstake decoded data', () => {
    const ix = buildInstruction('liquid_unstake', { msol_amount: new BN(1_500_000_000) });

    const result = decodeMarinadeInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.msolAmount).toBe(BigInt(1_500_000_000));
  });

  it('populates msolAmount from order_unstake decoded data', () => {
    const ix = buildInstruction('order_unstake', { msol_amount: new BN(750_000_000) });

    const result = decodeMarinadeInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.msolAmount).toBe(BigInt(750_000_000));
  });
});

// --- account resolution ---

describe('decodeMarinadeInstruction - account resolution', () => {
  it('resolves named accounts for deposit instruction', () => {
    const accounts = [
      'state111111111111111111111111111111111111111',
      'msolMint111111111111111111111111111111111111',
      'liqPoolSolLeg1111111111111111111111111111111',
      'liqPoolMsolLeg111111111111111111111111111111',
      'msolLegAuth11111111111111111111111111111111',
      'reservePda11111111111111111111111111111111',
      'transferFrom111111111111111111111111111111',
      'mintTo1111111111111111111111111111111111111',
      'msolMintAuth1111111111111111111111111111111',
      'SystemProgram11111111111111111111111111111',
      'TokenProgram11111111111111111111111111111',
    ];
    const ix = buildInstruction('deposit', { lamports: new BN(1_000_000_000) }, accounts);

    const result = decodeMarinadeInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.resolvedAccounts?.[0]?.name).toBe('state');
    expect(result?.resolvedAccounts?.[0]?.pubkey).toBe(accounts[0]);
    expect(result?.resolvedAccounts?.[6]?.name).toBe('transfer_from');
    expect(result?.accountsStrictMatch).toBe(true);
  });

  it('resolves named accounts for liquid_unstake instruction', () => {
    const accounts = Array.from({ length: 10 }, (_, i) => `Account${i}`);
    const ix = buildInstruction('liquid_unstake', { msol_amount: new BN(500_000_000) }, accounts);

    const result = decodeMarinadeInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.resolvedAccounts?.[5]?.name).toBe('get_msol_from');
  });
});

// --- hardening ---

describe('decodeMarinadeInstruction - hardening', () => {
  it('returns null for wrong programId', () => {
    const ix = buildInstruction('deposit', { lamports: new BN(1_000_000_000) });
    const wrongIx: ParsedInstruction = {
      ...ix,
      programId: 'WrongProgram11111111111111111111111111111111',
    };

    expect(decodeMarinadeInstruction(wrongIx)).toBeNull();
  });

  it('returns null for programId mismatch in ix.programId field', () => {
    const ix = buildInstruction('deposit', { lamports: new BN(1_000_000_000) });
    const mismatchedIx: ParsedInstruction = {
      ...ix,
      programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    };

    expect(decodeMarinadeInstruction(mismatchedIx)).toBeNull();
  });

  it('returns null for malformed data', () => {
    const ix: ParsedInstruction = {
      programId: MARINADE_PROGRAM_ID,
      programName: 'Marinade Finance',
      accounts: ['Account1'],
      data: '###bad###',
      depth: 0,
      innerInstructions: [],
    };

    expect(decodeMarinadeInstruction(ix)).toBeNull();
  });

  it('returns unknown fallback with low confidence for unrecognized discriminator', () => {
    const ix: ParsedInstruction = {
      programId: MARINADE_PROGRAM_ID,
      programName: 'Marinade Finance',
      accounts: ['Account1'],
      data: '0000000000000000' + '00'.repeat(10),
      depth: 0,
      innerInstructions: [],
    };

    const result = decodeMarinadeInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('unknown');
    expect(result?.confidence).toBe('low');
  });

  it('returns null for empty data', () => {
    const ix: ParsedInstruction = {
      programId: MARINADE_PROGRAM_ID,
      programName: 'Marinade Finance',
      accounts: ['Account1'],
      data: '',
      depth: 0,
      innerInstructions: [],
    };

    expect(decodeMarinadeInstruction(ix)).toBeNull();
  });

  it('decodes via DEFAULT_IDL_BY_PROGRAM when no IDL is passed explicitly', () => {
    const ix = buildInstruction('deposit', { lamports: new BN(1_000_000_000) });

    const result = decodeAnchorInstruction(MARINADE_PROGRAM_ID, ix);
    expect(result).not.toBeNull();
    expect(result?.anchorInstructionName).toBe('deposit');
    expect(result?.confidence).toBe('high');
    expect(result?.decoderType).toBe('anchor');
  });

  it('preserves rawData and discriminator on successful decode', () => {
    const ix = buildInstruction('deposit', { lamports: new BN(1_000_000_000) });

    const result = decodeMarinadeInstruction(ix);
    expect(result).not.toBeNull();
    expect(result?.rawData).toBe(ix.data);
    expect(result?.discriminator).toHaveLength(16);
  });
});
