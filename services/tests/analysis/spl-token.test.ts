import { describe, it, expect } from 'vitest';
import { decodeSPLInstruction } from '../../src/analysis/decoders/spl-token';
import type { ParsedInstruction } from '../../src/analysis/types';
import { Buffer } from 'buffer';

function encodeU64LE(value: bigint): Buffer {
  const bytes = Buffer.alloc(8);
  let current = value;

  for (let i = 0; i < 8; i += 1) {
    bytes[i] = Number(current & 0xffn);
    current >>= 8n;
  }

  return bytes;
}

describe('decodeSPLInstruction', () => {
  describe('Transfer instruction', () => {
    it('should decode Transfer (type 3) instruction', () => {
      // Criar buffer: type 3 + amount 100
      const amountBuffer = encodeU64LE(100n);

      const dataBuffer = Buffer.concat([
        Buffer.from([3]), // Transfer type
        amountBuffer,
      ]);
      const data = dataBuffer.toString('base64');

      const ix: ParsedInstruction = {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        programName: 'Token Program',
        data,
        accounts: ['source123', 'dest456', 'auth789'],
        depth: 0,
        innerInstructions: [],
      };

      const result = decodeSPLInstruction(ix);

      expect(result).toBeDefined();
      expect(result?.instructionName).toBe('transfer');
      expect(result?.amount).toBe('100');
      expect(result?.source).toBe('source123');
      expect(result?.destination).toBe('dest456');
      expect(result?.authority).toBe('auth789');
    });

    it('should handle large amounts (100 USDC with 6 decimals)', () => {
      // 100 USDC = 100_000_000 lamports (6 decimals)
      const amountBuffer = encodeU64LE(100_000_000n);

      const dataBuffer = Buffer.concat([Buffer.from([3]), amountBuffer]);
      const data = dataBuffer.toString('base64');

      const ix: ParsedInstruction = {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        programName: 'Token Program',
        data,
        accounts: ['usdc_from', 'usdc_to', 'user'],
        depth: 0,
        innerInstructions: [],
      };

      const result = decodeSPLInstruction(ix);

      expect(result?.amount).toBe('100000000');
    });
  });

  describe('MintTo instruction', () => {
    it('should decode MintTo (type 8) instruction', () => {
      const amountBuffer = encodeU64LE(50n);

      const dataBuffer = Buffer.concat([Buffer.from([8]), amountBuffer]);
      const data = dataBuffer.toString('base64');

      const ix: ParsedInstruction = {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        programName: 'Token Program',
        data,
        accounts: ['mint123', 'dest456', 'mintauth789'],
        depth: 0,
        innerInstructions: [],
      };

      const result = decodeSPLInstruction(ix);

      expect(result?.instructionName).toBe('mintTo');
      expect(result?.amount).toBe('50');
      expect(result?.mint).toBe('mint123');
      expect(result?.destination).toBe('dest456');
      expect(result?.authority).toBe('mintauth789');
    });
  });

  describe('TransferChecked instruction', () => {
    it('should decode TransferChecked (type 12) instruction', () => {
      const amountBuffer = encodeU64LE(2500000n);

      const dataBuffer = Buffer.concat([
        Buffer.from([12]), // TransferChecked type
        amountBuffer,
        Buffer.from([6]), // decimals
      ]);
      const data = dataBuffer.toString('base64');

      const ix: ParsedInstruction = {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        programName: 'Token Program',
        data,
        accounts: ['source123', 'mint456', 'dest789', 'auth000'],
        depth: 0,
        innerInstructions: [],
      };

      const result = decodeSPLInstruction(ix);

      expect(result?.instructionName).toBe('transferChecked');
      expect(result?.amount).toBe('2500000');
      expect(result?.decimals).toBe(6);
      expect(result?.source).toBe('source123');
      expect(result?.mint).toBe('mint456');
      expect(result?.destination).toBe('dest789');
      expect(result?.authority).toBe('auth000');
    });

    it('should handle pre-decoded TransferChecked', () => {
      const ix: ParsedInstruction = {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        programName: 'Token Program',
        data: '',
        accounts: [],
        depth: 0,
        innerInstructions: [],
        parsed: {
          type: 'transferChecked',
          info: {
            source: 'sourceA',
            destination: 'destB',
            mint: 'mintC',
            authority: 'authD',
            tokenAmount: {
              amount: '1200000',
              decimals: 6,
            },
          },
        },
      };

      const result = decodeSPLInstruction(ix);

      expect(result?.instructionName).toBe('transferChecked');
      expect(result?.amount).toBe('1200000');
      expect(result?.decimals).toBe(6);
      expect(result?.source).toBe('sourceA');
      expect(result?.destination).toBe('destB');
      expect(result?.mint).toBe('mintC');
      expect(result?.authority).toBe('authD');
    });
  });

  describe('Burn instruction', () => {
    it('should decode Burn (type 9) instruction', () => {
      const amountBuffer = encodeU64LE(25n);

      const dataBuffer = Buffer.concat([Buffer.from([9]), amountBuffer]);
      const data = dataBuffer.toString('base64');

      const ix: ParsedInstruction = {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        programName: 'Token Program',
        data,
        accounts: ['source123', 'mint456', 'owner789'],
        depth: 0,
        innerInstructions: [],
      };

      const result = decodeSPLInstruction(ix);

      expect(result?.instructionName).toBe('burn');
      expect(result?.amount).toBe('25');
      expect(result?.source).toBe('source123');
      expect(result?.mint).toBe('mint456');
      expect(result?.authority).toBe('owner789');
    });
  });

  describe('Pre-decoded instructions', () => {
    it('should handle pre-decoded Transfer', () => {
      const ix: ParsedInstruction = {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        programName: 'Token Program',
        data: '',
        accounts: [],
        depth: 0,
        innerInstructions: [],
        parsed: {
          type: 'transfer',
          info: {
            source: 'from123',
            destination: 'to456',
            tokenAmount: {
              amount: '500',
              decimals: 6,
            },
            authority: 'auth789',
          },
        },
      };

      const result = decodeSPLInstruction(ix);

      expect(result?.instructionName).toBe('transfer');
      expect(result?.amount).toBe('500');
      expect(result?.decimals).toBe(6);
      expect(result?.source).toBe('from123');
      expect(result?.destination).toBe('to456');
    });
  });

  describe('Unknown/invalid instructions', () => {
    it('should return unknown for unrecognized instruction type', () => {
      const dataBuffer = Buffer.from([99]); // Unknown type
      const data = dataBuffer.toString('base64');

      const ix: ParsedInstruction = {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        programName: 'Token Program',
        data,
        accounts: [],
        depth: 0,
        innerInstructions: [],
      };

      const result = decodeSPLInstruction(ix);

      expect(result?.instructionName).toBe('unknown');
      expect(result?.rawData).toBe(data);
    });

    it('should return null for empty data', () => {
      const ix: ParsedInstruction = {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        programName: 'Token Program',
        data: '',
        accounts: [],
        depth: 0,
        innerInstructions: [],
      };

      const result = decodeSPLInstruction(ix);
      expect(result).toBeNull();
    });

    it('should handle decode errors gracefully', () => {
      const ix: ParsedInstruction = {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        programName: 'Token Program',
        data: 'INVALID_BASE64!@#$%',
        accounts: [],
        depth: 0,
        innerInstructions: [],
      };

      const result = decodeSPLInstruction(ix);
      expect(result?.instructionName).toBe('unknown');
    });
  });

  describe('Edge cases', () => {
    it('should handle very large token amounts', () => {
      // Max u64: 18,446,744,073,709,551,615
      const amountBuffer = encodeU64LE(9999999999999999n);

      const dataBuffer = Buffer.concat([Buffer.from([3]), amountBuffer]);
      const data = dataBuffer.toString('base64');

      const ix: ParsedInstruction = {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        programName: 'Token Program',
        data,
        accounts: ['a', 'b', 'c'],
        depth: 0,
        innerInstructions: [],
      };

      const result = decodeSPLInstruction(ix);
      expect(result?.amount).toBe('9999999999999999');
    });

    it('should handle zero amounts', () => {
      const amountBuffer = encodeU64LE(0n);

      const dataBuffer = Buffer.concat([Buffer.from([3]), amountBuffer]);
      const data = dataBuffer.toString('base64');

      const ix: ParsedInstruction = {
        programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        programName: 'Token Program',
        data,
        accounts: ['a', 'b', 'c'],
        depth: 0,
        innerInstructions: [],
      };

      const result = decodeSPLInstruction(ix);
      expect(result?.amount).toBe('0');
    });
  });
});
