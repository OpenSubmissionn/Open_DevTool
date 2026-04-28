import { readFileSync } from 'fs';
import { resolve } from 'path';
import { RawTransactionBundle } from '../src/analysis/types';

export const DEVNET_TX_SIGNATURE =
  '5j7s8K9mN2pQ3rT4uV5wX6yZ7aB8cD9eF0gH1iJ2kL3mN4oP5qR6sT7uV8wX9yZ';

export function mockRPCBundle(overrides: Partial<RawTransactionBundle> = {}): RawTransactionBundle {
  const defaultBundle: RawTransactionBundle = {
    signature: 'mockSignature123',
    slot: 12345678,
    blockTime: null,
    transaction: {
      signatures: ['mockSignature123'],
      message: {
        accountKeys: [
          '11111111111111111111111111111111',
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        ],
        instructions: [],
      },
    },
    logMessages: [
      'Program 11111111111111111111111111111111 invoke [1]',
      'Program log: Instruction: Transfer',
      'Program 11111111111111111111111111111111 consumed 3000 of 200000 compute units',
      'Program 11111111111111111111111111111111 success',
    ],
    computeUnitsConsumed: 3000,
    preBalances: [1000000, 2000000],
    postBalances: [700000, 2300000],
    preTokenBalances: [],
    postTokenBalances: [],
    innerInstructions: [],
    accountKeys: [
      '11111111111111111111111111111111',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    ],
    rawResponse: {} as any,
    err: null,
  };

  return { ...defaultBundle, ...overrides };
}

export function loadFixture(name: 'txSuccess' | 'txFailed'): RawTransactionBundle {
  const filePath = resolve(__dirname, 'fixtures', `${name}.json`);
  const data = readFileSync(filePath, 'utf-8');
  return JSON.parse(data);
}
