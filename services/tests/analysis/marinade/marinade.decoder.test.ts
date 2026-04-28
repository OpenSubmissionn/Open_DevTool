import { describe, it, expect } from 'vitest';
import { BorshCoder } from '@coral-xyz/anchor';
import BN from 'bn.js';

import { decodeMarinadeInstruction } from '../../../src/analysis/decoders/marinade/decoder';
import { MARINADE_IDL, MARINADE_PROGRAM_ID } from '../../../src/analysis/decoders/marinade/idl';

// Helper function to encode instruction data using the same IDL as the decoder
function buildInstructionData(name: string, args: Record<string, any>): string {
  const coder = new BorshCoder(MARINADE_IDL);

  // Normalize arguments: Anchor expects BN for numeric types like u64/u128
  const normalizedArgs: Record<string, any> = {};
  for (const key in args) {
    const value = args[key];

    // Convert numbers to BN to avoid Borsh encoding errors
    normalizedArgs[key] = typeof value === 'number' ? new BN(value) : value;
  }

  const encoded = coder.instruction.encode(name, normalizedArgs);

  return Buffer.from(encoded).toString('base64');
}

// Creates a mock instruction object compatible with the decoder
function createMockIx(data: string) {
  return {
    programId: MARINADE_PROGRAM_ID,
    accounts: ['Account1', 'Account2'],
    data,
  };
}

describe('Marinade Decoder (REAL validation)', () => {
  it('should decode deposit correctly', () => {
    const data = buildInstructionData('deposit', {
      lamports: 1_000_000_000,
    });

    const ix = createMockIx(data);

    const result = decodeMarinadeInstruction(ix as any);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('deposit');

    expect(result?.decodedData).toBeDefined();

    // Decoded values are BN, so convert to number for comparison
    expect((result?.decodedData as any).lamports.toNumber()).toBe(1_000_000_000);
  });

  it('should decode unstake correctly', () => {
    const data = buildInstructionData('unstake', {
      msol_amount: 500_000_000,
    });

    const ix = createMockIx(data);

    const result = decodeMarinadeInstruction(ix as any);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('unstake');

    expect(result?.decodedData).toBeDefined();

    expect((result?.decodedData as any).msol_amount.toNumber()).toBe(500_000_000);
  });

  it('should return null for wrong programId', () => {
    const data = buildInstructionData('deposit', {
      lamports: 123,
    });

    const ix = {
      programId: 'INVALID_PROGRAM',
      accounts: [],
      data,
    };

    const result = decodeMarinadeInstruction(ix as any);

    expect(result).toBeNull();
  });

  it('should return null for corrupted data', () => {
    const ix = createMockIx('INVALID_BASE64');

    const result = decodeMarinadeInstruction(ix as any);

    expect(result).toBeNull();
  });
});
