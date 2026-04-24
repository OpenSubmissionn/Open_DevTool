import { describe, expect, it } from 'vitest';
import { parseTransaction } from '../../src/analysis/txParser';
import type { RawTransactionBundle } from '../../src/analysis/types';
import simpleFixture from '../fixtures/txParserSimple.json';
import complexFixture from '../fixtures/txParserComplex.json';

describe('parseTransaction', () => {
  function createBundleWithLogs(overrides: Partial<RawTransactionBundle>): RawTransactionBundle {
    return {
      signature: 'cu-attribution-signature',
      slot: 455700010,
      blockTime: 1713134444,
      transaction: {
        message: {
          instructions: [],
        },
      },
      logMessages: [],
      preBalances: [1000],
      postBalances: [1000],
      preTokenBalances: [],
      postTokenBalances: [],
      innerInstructions: [],
      computeUnitsConsumed: null,
      err: null,
      accountKeys: [],
      ...overrides,
    };
  }

  it('parses a simple transaction instruction and resolves program metadata', async () => {
    const bundle = simpleFixture as RawTransactionBundle;

    const parsed = await parseTransaction(bundle);

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

  it('builds inner instruction tree and decodes data as hex in complex transaction', async () => {
    const bundle = complexFixture as RawTransactionBundle;

    const parsed = await parseTransaction(bundle);

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

  it('supports parsed-style instructions and account key object variants', async () => {
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

    const parsed = await parseTransaction(bundle);

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

  it('returns safe defaults when instruction/message payload is missing', async () => {
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

    const parsed = await parseTransaction(bundle);

    expect(parsed.success).toBe(false);
    expect(parsed.fee).toBe(7777);
    expect(parsed.instructions).toEqual([]);
  });

  it('attributes CU by program and depth when the same program appears in parent and child CPI', async () => {
    const repeatedProgramId = 'RepeatDepth1111111111111111111111111111111';

    const bundle = createBundleWithLogs({
      signature: 'cu-depth-signature',
      transaction: {
        message: {
          instructions: [
            {
              programIdIndex: 2,
              accounts: [0],
              data: '',
            },
          ],
        },
      },
      innerInstructions: [
        {
          index: 0,
          instructions: [
            {
              programIdIndex: 2,
              accounts: [1],
              data: '',
            },
          ],
        },
      ],
      accountKeys: ['SignerA111111111111111111111111111111111', 'ChildA1111111111111111111111111111111111', repeatedProgramId],
      logMessages: [
        `Program ${repeatedProgramId} invoke [1]`,
        `Program ${repeatedProgramId} invoke [2]`,
        `Program ${repeatedProgramId} consumed 30 of 200000 compute units`,
        `Program ${repeatedProgramId} success`,
        `Program ${repeatedProgramId} consumed 70 of 200000 compute units`,
        `Program ${repeatedProgramId} success`,
      ],
    });

    const parsed = await parseTransaction(bundle);

    expect(parsed.instructions[0].cuConsumed).toBe(70);
    expect(parsed.instructions[0].innerInstructions[0].cuConsumed).toBe(30);
  });

  it('recursively parses nested inner instructions and preserves deeper CPI depth', async () => {
    const parentProgramId = 'ParentProgram1111111111111111111111111111';
    const childProgramId = 'ChildProgram11111111111111111111111111111';

    const bundle = createBundleWithLogs({
      signature: 'nested-cpi-signature',
      transaction: {
        message: {
          instructions: [
            {
              programIdIndex: 1,
              accounts: [0],
              data: '',
            },
          ],
        },
      },
      innerInstructions: [
        {
          index: 0,
          instructions: [
            {
              programIdIndex: 2,
              accounts: [1],
              data: '',
              innerInstructions: [
                {
                  programIdIndex: 2,
                  accounts: [2],
                  data: '',
                },
              ],
            },
          ],
        },
      ],
      accountKeys: [
        'SignerNested111111111111111111111111111111',
        parentProgramId,
        childProgramId,
      ],
    });

    const parsed = await parseTransaction(bundle);

    expect(parsed.instructions).toHaveLength(1);
    expect(parsed.instructions[0].depth).toBe(0);
    expect(parsed.instructions[0].innerInstructions).toHaveLength(1);
    expect(parsed.instructions[0].innerInstructions[0].depth).toBe(1);
    expect(parsed.instructions[0].innerInstructions[0].innerInstructions).toHaveLength(1);
    expect(parsed.instructions[0].innerInstructions[0].innerInstructions[0].depth).toBe(2);
  });

  it('attributes CU in invocation order for repeated program calls at the same depth', async () => {
    const programId = 'OrderProgram111111111111111111111111111111';

    const bundle = createBundleWithLogs({
      signature: 'cu-order-signature',
      transaction: {
        message: {
          instructions: [
            { programIdIndex: 2, accounts: [0], data: '' },
            { programIdIndex: 2, accounts: [1], data: '' },
          ],
        },
      },
      accountKeys: ['Acct0Order11111111111111111111111111111111', 'Acct1Order11111111111111111111111111111111', programId],
      logMessages: [
        `Program ${programId} invoke [1]`,
        `Program ${programId} consumed 5 of 200000 compute units`,
        `Program ${programId} success`,
        `Program ${programId} invoke [1]`,
        `Program ${programId} consumed 9 of 200000 compute units`,
        `Program ${programId} success`,
      ],
    });

    const parsed = await parseTransaction(bundle);

    expect(parsed.instructions[0].cuConsumed).toBe(5);
    expect(parsed.instructions[1].cuConsumed).toBe(9);
  });

  it('leaves cuConsumed undefined when an instruction has no matching CU log', async () => {
    const programA = 'ProgramA111111111111111111111111111111111';
    const programB = 'ProgramB111111111111111111111111111111111';

    const bundle = createBundleWithLogs({
      signature: 'cu-missing-log-signature',
      transaction: {
        message: {
          instructions: [
            { programIdIndex: 2, accounts: [0], data: '' },
            { programIdIndex: 3, accounts: [1], data: '' },
          ],
        },
      },
      accountKeys: ['AcctA11111111111111111111111111111111111', 'AcctB11111111111111111111111111111111111', programA, programB],
      logMessages: [
        `Program ${programA} invoke [1]`,
        `Program ${programA} consumed 11 of 200000 compute units`,
        `Program ${programA} success`,
      ],
    });

    const parsed = await parseTransaction(bundle);

    expect(parsed.instructions[0].cuConsumed).toBe(11);
    expect(parsed.instructions[1].cuConsumed).toBeUndefined();
  });

  it('ignores deeper nested CPI CU when parsed instructions only include first-level inner calls', async () => {
    const outerProgram = 'Outer111111111111111111111111111111111111';
    const innerProgram = 'Inner111111111111111111111111111111111111';
    const deepProgram = 'Deep1111111111111111111111111111111111111';

    const bundle = createBundleWithLogs({
      signature: 'cu-nested-signature',
      transaction: {
        message: {
          instructions: [{ programIdIndex: 3, accounts: [0], data: '' }],
        },
      },
      innerInstructions: [
        {
          index: 0,
          instructions: [{ programIdIndex: 4, accounts: [1], data: '' }],
        },
      ],
      accountKeys: [
        'OuterAcct111111111111111111111111111111111',
        'InnerAcct111111111111111111111111111111111',
        deepProgram,
        outerProgram,
        innerProgram,
      ],
      logMessages: [
        `Program ${outerProgram} invoke [1]`,
        `Program ${innerProgram} invoke [2]`,
        `Program ${deepProgram} invoke [3]`,
        `Program ${deepProgram} consumed 3 of 200000 compute units`,
        `Program ${deepProgram} success`,
        `Program ${innerProgram} consumed 20 of 200000 compute units`,
        `Program ${innerProgram} success`,
        `Program ${outerProgram} consumed 40 of 200000 compute units`,
        `Program ${outerProgram} success`,
      ],
    });

    const parsed = await parseTransaction(bundle);

    expect(parsed.instructions[0].cuConsumed).toBe(40);
    expect(parsed.instructions[0].innerInstructions[0].cuConsumed).toBe(20);
  });

  it('handles failed instruction logs and still attributes consumed CU when present', async () => {
    const failedProgram = 'Failed11111111111111111111111111111111111';

    const bundle = createBundleWithLogs({
      signature: 'cu-failed-signature',
      err: { InstructionError: [0, 'Custom'] },
      transaction: {
        message: {
          instructions: [{ programIdIndex: 1, accounts: [0], data: '' }],
        },
      },
      accountKeys: ['FailedAcct111111111111111111111111111111111', failedProgram],
      logMessages: [
        `Program ${failedProgram} invoke [1]`,
        `Program ${failedProgram} consumed 15 of 200000 compute units`,
        `Program ${failedProgram} failed: custom program error: 0x1`,
      ],
    });

    const parsed = await parseTransaction(bundle);

    expect(parsed.success).toBe(false);
    expect(parsed.instructions[0].cuConsumed).toBe(15);
  });
});
