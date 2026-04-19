import { describe, expect, it } from 'vitest';
import { parseTransaction } from '../../src/analysis/txParser';
import type { RawTransactionBundle } from '../../src/analysis/types';
import simpleFixture from '../fixtures/txParserSimple.json';
import complexFixture from '../fixtures/txParserComplex.json';

describe('parseTransaction', () => {
  it('parses a simple transaction instruction and resolves program metadata', () => {
    const bundle = simpleFixture as RawTransactionBundle;

    const parsed = parseTransaction(bundle);

    expect(parsed.signature).toBe('tx-parser-simple-signature');
    expect(parsed.slot).toBe(455700001);
    expect(parsed.blockTime).toBe(1713131111);
    expect(parsed.success).toBe(true);
    expect(parsed.fee).toBe(5000);

    expect(parsed.instructions).toHaveLength(1);
    expect(parsed.instructions[0]).toMatchObject({
      programId: '11111111111111111111111111111111',
      programName: 'System Program',
      accounts: [
        'Signer1111111111111111111111111111111111',
        'Receiver11111111111111111111111111111111',
      ],
      data: '010203',
      depth: 0,
    });
    expect(parsed.instructions[0].innerInstructions).toEqual([]);
  });

  it('builds inner instruction tree and decodes data as hex in complex transaction', () => {
    const bundle = complexFixture as RawTransactionBundle;

    const parsed = parseTransaction(bundle);

    expect(parsed.instructions).toHaveLength(2);

    expect(parsed.instructions[0]).toMatchObject({
      programId: '11111111111111111111111111111111',
      programName: 'System Program',
      accounts: [
        'SignerComplex111111111111111111111111111111',
        'SourceToken11111111111111111111111111111111',
      ],
      data: '0a0b',
      depth: 0,
    });

    expect(parsed.instructions[0].innerInstructions).toHaveLength(1);
    expect(parsed.instructions[0].innerInstructions[0]).toMatchObject({
      programId: 'TokenkegQfeZyiNwAJsyFbPVwwQQfubRS6R8wDkxjn4',
      programName: 'Token Program',
      accounts: [
        'SourceToken11111111111111111111111111111111',
        'DestinationToken111111111111111111111111111',
      ],
      data: '090a',
      depth: 1,
    });

    expect(parsed.instructions[1]).toMatchObject({
      programId: 'TokenkegQfeZyiNwAJsyFbPVwwQQfubRS6R8wDkxjn4',
      programName: 'Token Program',
      accounts: [
        'SourceToken11111111111111111111111111111111',
        'DestinationToken111111111111111111111111111',
        'SignerComplex111111111111111111111111111111',
      ],
      data: '0405060708',
      depth: 0,
    });

    expect(parsed.instructions[1].innerInstructions).toHaveLength(1);
    expect(parsed.instructions[1].innerInstructions[0]).toMatchObject({
      programId: 'ComputeBudget111111111111111111111111111111',
      programName: 'Compute Budget',
      accounts: ['SignerComplex111111111111111111111111111111'],
      data: '0f10',
      depth: 1,
    });
  });

  it('supports parsed-style instructions and account key object variants', () => {
    const bundle: RawTransactionBundle = {
      signature: 'parsed-shape-signature',
      slot: 455700003,
      blockTime: undefined,
      transaction: {
        message: {
          instructions: [
            {
              programId: 'ComputeBudget111111111111111111111111111111',
              accounts: [{ pubkey: 'AccountA11111111111111111111111111111111' }, null],
              data: 'AQ==',
            },
            {
              programId: {
                toBase58: () => '11111111111111111111111111111111',
              },
              accounts: ['AccountB22222222222222222222222222222222'],
              data: 'AQID',
            },
          ],
        },
      },
      logMessages: [],
      preBalances: [10],
      postBalances: [10],
      preTokenBalances: [],
      postTokenBalances: [],
      innerInstructions: [{ index: 999, instructions: [] }, { index: 'bad', instructions: [{}] }],
      computeUnitsConsumed: null,
      err: null,
      accountKeys: [
        { pubkey: 'SignerObject111111111111111111111111111111' },
        {
          pubkey: {
            toBase58: () => 'PubkeyFromNestedObject111111111111111111111',
          },
        },
      ],
    };

    const parsed = parseTransaction(bundle);

    expect(parsed.blockTime).toBeNull();
    expect(parsed.instructions).toHaveLength(2);
    expect(parsed.instructions[0].programName).toBe('Compute Budget');
    expect(parsed.instructions[0].accounts).toEqual([
      'AccountA11111111111111111111111111111111',
      'unknown-account',
    ]);
    expect(parsed.instructions[0].data).toBe('01');

    expect(parsed.instructions[1].data).toBe('010203');
    expect(parsed.instructions[1].programName).toBe('System Program');
  });

  it('returns safe defaults when instruction/message payload is missing', () => {
    const bundle: RawTransactionBundle = {
      signature: 'missing-message-signature',
      slot: 455700004,
      blockTime: 1713133333,
      transaction: null,
      logMessages: [],
      preBalances: [1000],
      postBalances: [1000],
      preTokenBalances: [],
      postTokenBalances: [],
      innerInstructions: [],
      computeUnitsConsumed: null,
      err: { InstructionError: [0, 'Custom'] },
      accountKeys: [
        {
          toBase58: () => 'FallbackToBase5811111111111111111111111111111',
        },
        {},
      ],
      rawResponse: {
        meta: {
          fee: 7777,
        },
      } as never,
    };

    const parsed = parseTransaction(bundle);

    expect(parsed.success).toBe(false);
    expect(parsed.fee).toBe(7777);
    expect(parsed.instructions).toEqual([]);
  });
});
