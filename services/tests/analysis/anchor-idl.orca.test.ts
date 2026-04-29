import { BN, BorshCoder } from '@coral-xyz/anchor';
import { describe, expect, it } from 'vitest';
import {
  ORCA_WHIRLPOOL_IDL,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  decodeAnchorInstruction,
} from '../../src/analysis/decoders/anchor-idl';
import type { ParsedInstruction } from '../../src/analysis/types';

const orcaCoder = new BorshCoder(ORCA_WHIRLPOOL_IDL);
const FIXTURE_ORCA_OPEN_POSITION_HEX = '87802f4d0f98f03101c0ffffff40000000';

function buildInstruction(
  name: string,
  args: Record<string, unknown>,
  accounts: string[] = ['Account1']
): ParsedInstruction {
  return {
    programId: ORCA_WHIRLPOOL_PROGRAM_ID,
    programName: 'Orca Whirlpool',
    accounts,
    data: orcaCoder.instruction.encode(name, args).toString('hex'),
    depth: 0,
    innerInstructions: [],
  };
}

describe('decodeAnchorInstruction - Orca Whirlpool', () => {
  it('decodes initialize pool instruction', () => {
    const ix = buildInstruction('initialize_pool', {
      bumps: { whirlpool_bump: 1 },
      tick_spacing: 64,
      initial_sqrt_price: new BN(1000000),
    });

    const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('initializePool');
    expect(result?.anchorInstructionName).toBe('initialize_pool');
    expect(result?.type).toBe('pool_initialization');
    expect(result?.programId).toBe(ORCA_WHIRLPOOL_PROGRAM_ID);
  });

  it('decodes open position instruction', () => {
    const ix = buildInstruction('open_position', {
      bumps: { position_bump: 1 },
      tick_lower_index: -64,
      tick_upper_index: 64,
    });

    const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('openPosition');
    expect(result?.action).toBe('open');
    expect(result?.resolvedAccounts?.[0]?.name).toBe('funder');
  });

  it('decodes close position instruction', () => {
    const ix = buildInstruction('close_position', {}, ['Position1', 'Authority1']);
    const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('closePosition');
    expect(result?.action).toBe('close');
  });

  it('decodes swap instruction', () => {
    const ix = buildInstruction('swap', {
      amount: new BN(1_000_000_000),
      other_amount_threshold: new BN(990_000_000),
      sqrt_price_limit: new BN(0),
      amount_specified_is_input: true,
      a_to_b: false,
    });
    const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('swap');
    expect(result?.type).toBe('swap');
  });

  it('decodes increase liquidity instruction', () => {
    const ix = buildInstruction('increase_liquidity', {
      liquidity_amount: new BN(500_000),
      token_max_a: new BN(1_000_000),
      token_max_b: new BN(2_000_000),
    });
    const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('increaseLiquidity');
    expect(result?.action).toBe('increase');
  });
});

describe('decodeAnchorInstruction - Orca hardening', () => {
  it('decodes base64 instruction payloads', () => {
    const hexIx = buildInstruction('open_position', {
      bumps: { position_bump: 1 },
      tick_lower_index: -16,
      tick_upper_index: 16,
    });
    const base64Ix = { ...hexIx, data: Buffer.from(hexIx.data, 'hex').toString('base64') };

    const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, base64Ix);
    expect(result).not.toBeNull();
    expect(result?.inputEncoding).toBe('base64');
  });

  it('decodes fixed Orca payload vector', () => {
    const ix = {
      programId: ORCA_WHIRLPOOL_PROGRAM_ID,
      programName: 'Orca Whirlpool',
      accounts: ['Account1'],
      data: FIXTURE_ORCA_OPEN_POSITION_HEX,
      depth: 0,
      innerInstructions: [],
    } as ParsedInstruction;

    const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix);
    expect(result).not.toBeNull();
    expect(result?.anchorInstructionName).toBe('open_position');
  });

  it('returns null for malformed payload', () => {
    const badIx = { ...buildInstruction('close_position', {}), data: '###bad-data###' };
    expect(decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, badIx)).toBeNull();
  });

  it('keeps all runtime accounts even when IDL account list is shorter', () => {
    const ix = buildInstruction(
      'open_position',
      {
        bumps: { position_bump: 1 },
        tick_lower_index: -64,
        tick_upper_index: 64,
      },
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
    );

    const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.resolvedAccounts).toHaveLength(12);
    expect(result?.accountsStrictMatch).toBe(false);
    expect(result?.resolvedAccounts?.[10]?.name).toBe('unknown_10');
  });

  it('returns unknown fallback when payload has discriminator but truncated args', () => {
    const ix = {
      programId: ORCA_WHIRLPOOL_PROGRAM_ID,
      programName: 'Orca Whirlpool',
      accounts: ['Account1'],
      data: '87802f4d0f98f03101c0ffff',
      depth: 0,
      innerInstructions: [],
    } as ParsedInstruction;

    const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix);
    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('unknown');
    expect(result?.decoderType).toBe('anchor');
  });
});
