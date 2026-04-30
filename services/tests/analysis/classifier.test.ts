import { describe, it, expect } from 'vitest';
import { classifyTransaction } from '../../src/analysis/classifier';
import { ParsedTransaction } from '../../src/analysis/types';

describe('classifyTransaction', () => {
  it('should classify swap transaction', () => {
    const parsed: ParsedTransaction = {
      signature: 'test',
      slot: 1,
      blockTime: null,
      success: true,
      fee: 5000,
      instructions: [
        {
          programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
          programName: 'Raydium',
          accounts: [],
          data: '',
          decodedData: undefined,
          cuConsumed: undefined,
          depth: 0,
          innerInstructions: [],
        },
      ],
    };
    expect(classifyTransaction(parsed)).toBe('swap');
  });

  it('should classify transfer transaction', () => {
    const parsed: ParsedTransaction = {
      signature: 'test',
      slot: 1,
      blockTime: null,
      success: true,
      fee: 5000,
      instructions: [
        {
          programId: '11111111111111111111111111111111',
          programName: 'System Program',
          accounts: [],
          data: '',
          decodedData: undefined,
          cuConsumed: undefined,
          depth: 0,
          innerInstructions: [],
        },
      ],
    };
    expect(classifyTransaction(parsed)).toBe('transfer');
  });

  it('should classify nft-mint transaction', () => {
    const parsed: ParsedTransaction = {
      signature: 'test',
      slot: 1,
      blockTime: null,
      success: true,
      fee: 5000,
      instructions: [
        {
          programId: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
          programName: 'Metadata',
          accounts: [],
          data: '',
          decodedData: undefined,
          cuConsumed: undefined,
          depth: 0,
          innerInstructions: [],
        },
      ],
    };
    expect(classifyTransaction(parsed)).toBe('nft-mint');
  });

  it('should classify stake transaction', () => {
    const parsed: ParsedTransaction = {
      signature: 'test',
      slot: 1,
      blockTime: null,
      success: true,
      fee: 5000,
      instructions: [
        {
          programId: 'Stake11111111111111111111111111111111111111',
          programName: 'Stake Program',
          accounts: [],
          data: '',
          decodedData: undefined,
          cuConsumed: undefined,
          depth: 0,
          innerInstructions: [],
        },
      ],
    };
    expect(classifyTransaction(parsed)).toBe('stake');
  });

  it('should classify governance-vote transaction', () => {
    const parsed: ParsedTransaction = {
      signature: 'test',
      slot: 1,
      blockTime: null,
      success: true,
      fee: 5000,
      instructions: [
        {
          programId: 'GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw',
          programName: 'Governance',
          accounts: [],
          data: '',
          decodedData: undefined,
          cuConsumed: undefined,
          depth: 0,
          innerInstructions: [],
        },
      ],
    };
    expect(classifyTransaction(parsed)).toBe('governance-vote');
  });

  it('should classify failed-tx transaction', () => {
    const parsed: ParsedTransaction = {
      signature: 'test',
      slot: 1,
      blockTime: null,
      success: false,
      fee: 5000,
      instructions: [],
    };
    expect(classifyTransaction(parsed)).toBe('failed-tx');
  });

  it('should classify high-CU transaction', () => {
    const parsed: ParsedTransaction = {
      signature: 'test',
      slot: 1,
      blockTime: null,
      success: true,
      fee: 5000,
      instructions: Array(6).fill({
        programId: 'test',
        programName: 'Test',
        accounts: [],
        data: '',
        decodedData: undefined,
        cuConsumed: undefined,
        depth: 0,
        innerInstructions: [],
      }),
    };
    expect(classifyTransaction(parsed)).toBe('high-CU');
  });

  it('should classify deep-cpi transaction', () => {
    const parsed: ParsedTransaction = {
      signature: 'test',
      slot: 1,
      blockTime: null,
      success: true,
      fee: 5000,
      instructions: [
        {
          programId: 'test',
          programName: 'Test',
          accounts: [],
          data: '',
          decodedData: undefined,
          cuConsumed: undefined,
          depth: 3,
          innerInstructions: [],
        },
      ],
    };
    expect(classifyTransaction(parsed)).toBe('deep-cpi');
  });

  it('should classify multi-program transaction', () => {
    const parsed: ParsedTransaction = {
      signature: 'test',
      slot: 1,
      blockTime: null,
      success: true,
      fee: 5000,
      instructions: [
        {
          programId: 'p1',
          programName: 'P1',
          accounts: [],
          data: '',
          decodedData: undefined,
          cuConsumed: undefined,
          depth: 0,
          innerInstructions: [],
        },
        {
          programId: 'p2',
          programName: 'P2',
          accounts: [],
          data: '',
          decodedData: undefined,
          cuConsumed: undefined,
          depth: 0,
          innerInstructions: [],
        },
        {
          programId: 'p3',
          programName: 'P3',
          accounts: [],
          data: '',
          decodedData: undefined,
          cuConsumed: undefined,
          depth: 0,
          innerInstructions: [],
        },
        {
          programId: 'p4',
          programName: 'P4',
          accounts: [],
          data: '',
          decodedData: undefined,
          cuConsumed: undefined,
          depth: 0,
          innerInstructions: [],
        },
      ],
    };
    expect(classifyTransaction(parsed)).toBe('multi-program');
  });

  it('should classify unknown transaction', () => {
    const parsed: ParsedTransaction = {
      signature: 'test',
      slot: 1,
      blockTime: null,
      success: true,
      fee: 5000,
      instructions: [
        {
          programId: 'unknown',
          programName: 'Unknown',
          accounts: [],
          data: '',
          decodedData: undefined,
          cuConsumed: undefined,
          depth: 0,
          innerInstructions: [],
        },
      ],
    };
    expect(classifyTransaction(parsed)).toBe('unknown');
  });
});
