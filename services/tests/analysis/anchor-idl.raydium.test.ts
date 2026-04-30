import { BN, BorshCoder } from '@coral-xyz/anchor';
import { describe, expect, it } from 'vitest';
import {
  RAYDIUM_AMM_IDL,
  RAYDIUM_AMM_PROGRAM_ID,
  decodeAnchorInstruction,
} from '../../src/analysis/decoders/anchor-idl';

const raydiumCoder = new BorshCoder(RAYDIUM_AMM_IDL);

function buildInstruction(name: string, args: Record<string, unknown>) {
  return {
    programId: RAYDIUM_AMM_PROGRAM_ID,
    programName: 'Raydium AMM',
    accounts: ['Account1'],
    data: raydiumCoder.instruction.encode(name, args).toString('hex'),
    depth: 0,
    innerInstructions: [],
  };
}

describe('decodeAnchorInstruction - Raydium AMM', () => {
  it('decodes initialize instruction', () => {
    const ix = buildInstruction('initialize', {
      nonce: 7,
      open_time: new BN(1713200000),
    });
    const result = decodeAnchorInstruction(RAYDIUM_AMM_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('initialize');
    expect(result?.type).toBe('pool_initialization');
    expect(result?.decoderType).toBe('anchor');
    expect(result?.confidence).toBe('low');
  });

  it('decodes deposit instruction', () => {
    const ix = buildInstruction('deposit', {
      max_coin_amount: new BN(1_500_000),
      max_pc_amount: new BN(2_000_000),
      base_side: new BN(0),
    });
    const result = decodeAnchorInstruction(RAYDIUM_AMM_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('deposit');
    expect(result?.action).toBe('deposit');
    expect(result?.decoderType).toBe('anchor');
    expect(result?.confidence).toBe('low');
  });

  it('decodes withdraw instruction', () => {
    const ix = buildInstruction('withdraw', { amount: new BN(900_000) });
    const result = decodeAnchorInstruction(RAYDIUM_AMM_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('withdraw');
    expect(result?.action).toBe('withdraw');
    expect(result?.decoderType).toBe('anchor');
    expect(result?.confidence).toBe('low');
  });

  it('decodes swap base in instruction', () => {
    const ix = buildInstruction('swap_base_in', {
      amount_in: new BN(1_000_000),
      minimum_amount_out: new BN(990_000),
    });
    const result = decodeAnchorInstruction(RAYDIUM_AMM_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('swapBaseIn');
    expect(result?.action).toBe('exact_in');
    expect(result?.decoderType).toBe('anchor');
    expect(result?.confidence).toBe('low');
  });

  it('decodes swap base out instruction', () => {
    const ix = buildInstruction('swap_base_out', {
      max_amount_in: new BN(1_020_000),
      amount_out: new BN(1_000_000),
    });
    const result = decodeAnchorInstruction(RAYDIUM_AMM_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('swapBaseOut');
    expect(result?.action).toBe('exact_out');
    expect(result?.decoderType).toBe('anchor');
    expect(result?.confidence).toBe('low');
  });
});

describe('decodeAnchorInstruction - Raydium compatibility mode', () => {
  it('adds decoder warning for Raydium compatibility risk', () => {
    const ix = buildInstruction('deposit', {
      max_coin_amount: new BN(1000),
      max_pc_amount: new BN(2000),
      base_side: new BN(0),
    });

    const result = decodeAnchorInstruction(RAYDIUM_AMM_PROGRAM_ID, ix);
    expect(result).not.toBeNull();
    expect(result?.decoderWarning).toContain('custom non-Anchor binary layouts');
    expect(result?.decoderType).toBe('anchor');
    expect(result?.confidence).toBe('low');
  });

  it('can disable non-anchor compatibility mode explicitly', () => {
    const ix = buildInstruction('deposit', {
      max_coin_amount: new BN(1000),
      max_pc_amount: new BN(2000),
      base_side: new BN(0),
    });

    const result = decodeAnchorInstruction(RAYDIUM_AMM_PROGRAM_ID, ix, undefined, {
      allowNonAnchorPrograms: false,
    });

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('unknown');
    expect(result?.decoderType).toBe('custom');
    expect(result?.confidence).toBe('low');
  });
});
