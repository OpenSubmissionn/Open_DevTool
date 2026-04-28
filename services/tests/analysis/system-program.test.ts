import { describe, it, expect } from 'vitest';
import { decodeSystemInstruction } from '../../src/analysis/decoders/system-program';
import type { ParsedInstruction } from '../../src/analysis/types';

/**
 * Helper to create a buffer with u32 little-endian discriminator
 */
function createDiscriminator(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

/**
 * Helper to create a u64 little-endian value
 */
function createU64LE(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value), 0);
  return buf;
}

/**
 * Helper to create a 32-byte pubkey buffer
 */
function createPubkeyBuffer(): Buffer {
  // Create a 32-byte buffer (typical Solana pubkey size)
  return Buffer.from('000000000000000000000000000000000000000000000000000000000000aabb', 'hex');
}

describe('System Program Instruction Decoder', () => {
  it('decodes CreateAccount (0) instruction correctly', () => {
    // CreateAccount: [disc: u32][lamports: u64][space: u64][owner: Pubkey(32)]
    const discriminator = createDiscriminator(0);
    const lamports = createU64LE(100000000); // 0.1 SOL in lamports
    const space = createU64LE(165); // Size for a token mint account
    const owner = createPubkeyBuffer();

    const data = Buffer.concat([discriminator, lamports, space, owner]);
    const base64Data = data.toString('base64');

    const ix: ParsedInstruction = {
      programId: '11111111111111111111111111111111',
      programName: 'System Program',
      accounts: [
        'Signer1111111111111111111111111111111111',
        'NewAccount111111111111111111111111111111',
      ],
      data: base64Data,
      depth: 0,
      innerInstructions: [],
    };

    const decoded = decodeSystemInstruction(ix);

    expect(decoded).not.toBeNull();
    expect(decoded?.instructionName).toBe('CreateAccount');
    expect(decoded?.fromPubkey).toBe('Signer1111111111111111111111111111111111');
    expect(decoded?.newAccountPubkey).toBe('NewAccount111111111111111111111111111111');
    expect(decoded?.lamports).toBe(100000000);
    expect(decoded?.space).toBe(165);
    expect(decoded?.owner).toBeDefined();
    expect(decoded?.rawData).toBe(base64Data);
  });

  it('decodes Transfer (2) instruction correctly', () => {
    // Transfer: [disc: u32][lamports: u64]
    const discriminator = createDiscriminator(2);
    const lamports = createU64LE(5000000); // 0.005 SOL

    const data = Buffer.concat([discriminator, lamports]);
    const base64Data = data.toString('base64');

    const ix: ParsedInstruction = {
      programId: '11111111111111111111111111111111',
      programName: 'System Program',
      accounts: [
        'FromAccount11111111111111111111111111111',
        'ToAccount111111111111111111111111111111',
      ],
      data: base64Data,
      depth: 0,
      innerInstructions: [],
    };

    const decoded = decodeSystemInstruction(ix);

    expect(decoded).not.toBeNull();
    expect(decoded?.instructionName).toBe('Transfer');
    expect(decoded?.fromPubkey).toBe('FromAccount11111111111111111111111111111');
    expect(decoded?.toPubkey).toBe('ToAccount111111111111111111111111111111');
    expect(decoded?.lamports).toBe(5000000);
    expect(decoded?.rawData).toBe(base64Data);
  });

  it('decodes Allocate (8) instruction correctly', () => {
    // Allocate: [disc: u32][space: u64]
    const discriminator = createDiscriminator(8);
    const space = createU64LE(1024); // 1KB allocation

    const data = Buffer.concat([discriminator, space]);
    const base64Data = data.toString('base64');

    const ix: ParsedInstruction = {
      programId: '11111111111111111111111111111111',
      programName: 'System Program',
      accounts: ['Account11111111111111111111111111111111111'],
      data: base64Data,
      depth: 0,
      innerInstructions: [],
    };

    const decoded = decodeSystemInstruction(ix);

    expect(decoded).not.toBeNull();
    expect(decoded?.instructionName).toBe('Allocate');
    expect(decoded?.newAccountPubkey).toBe('Account11111111111111111111111111111111111');
    expect(decoded?.space).toBe(1024);
    expect(decoded?.rawData).toBe(base64Data);
  });

  it('decodes Assign (1) instruction correctly', () => {
    // Assign: [disc: u32][owner: Pubkey(32)]
    const discriminator = createDiscriminator(1);
    const owner = createPubkeyBuffer();

    const data = Buffer.concat([discriminator, owner]);
    const base64Data = data.toString('base64');

    const ix: ParsedInstruction = {
      programId: '11111111111111111111111111111111',
      programName: 'System Program',
      accounts: ['Account11111111111111111111111111111111111'],
      data: base64Data,
      depth: 0,
      innerInstructions: [],
    };

    const decoded = decodeSystemInstruction(ix);

    expect(decoded).not.toBeNull();
    expect(decoded?.instructionName).toBe('Assign');
    expect(decoded?.toPubkey).toBe('Account11111111111111111111111111111111111');
    expect(decoded?.owner).toBeDefined();
    expect(decoded?.rawData).toBe(base64Data);
  });

  it('handles malformed data gracefully', () => {
    const ix: ParsedInstruction = {
      programId: '11111111111111111111111111111111',
      programName: 'System Program',
      accounts: ['Account11111111111111111111111111111111111'],
      data: Buffer.from([0x00, 0x00]).toString('base64'), // Too short
      depth: 0,
      innerInstructions: [],
    };

    const decoded = decodeSystemInstruction(ix);

    expect(decoded).toBeNull();
  });

  it('returns null for missing data', () => {
    const ix: ParsedInstruction = {
      programId: '11111111111111111111111111111111',
      programName: 'System Program',
      accounts: ['Account11111111111111111111111111111111111'],
      data: '',
      depth: 0,
      innerInstructions: [],
    };

    const decoded = decodeSystemInstruction(ix);

    expect(decoded).toBeNull();
  });

  it('returns unknown instruction for unrecognized discriminator', () => {
    const discriminator = createDiscriminator(255); // Unknown discriminator
    const data = Buffer.concat([discriminator, Buffer.alloc(8)]);
    const base64Data = data.toString('base64');

    const ix: ParsedInstruction = {
      programId: '11111111111111111111111111111111',
      programName: 'System Program',
      accounts: [],
      data: base64Data,
      depth: 0,
      innerInstructions: [],
    };

    const decoded = decodeSystemInstruction(ix);

    expect(decoded).not.toBeNull();
    expect(decoded?.instructionName).toContain('Unknown');
    expect(decoded?.rawData).toBe(base64Data);
  });
});
