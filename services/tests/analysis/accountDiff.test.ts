import { describe, expect, it } from 'vitest';
import simpleTransferFixture from '../fixtures/accountDiffSimpleTransfer.json';
import complexSwapFixture from '../fixtures/accountDiffComplexTokenSwap.json';
import { computeAccountDiffs } from '../../src/analysis/accountDiff';
import type { RawTransactionBundle } from '../../src/analysis/types';

describe('computeAccountDiffs', () => {
  it('computes SOL deltas in lamports for a simple transfer and sorts signers first', () => {
    const bundle = simpleTransferFixture as RawTransactionBundle;

    const result = computeAccountDiffs(bundle);

    expect(result).toHaveLength(2);

    expect(result[0]).toMatchObject({
      pubkey: 'Signer1111111111111111111111111111111111',
      role: 'signer',
      solDelta: -105000,
      tokenDeltas: [],
    });

    expect(result[1]).toMatchObject({
      pubkey: 'Receiver11111111111111111111111111111111',
      role: 'writable',
      solDelta: 100000,
      tokenDeltas: [],
    });
  });

  it('includes token deltas for a complex token swap', () => {
    const bundle = complexSwapFixture as RawTransactionBundle;

    const result = computeAccountDiffs(bundle);

    expect(result).toHaveLength(3);
    expect(result[0].role).toBe('signer');
    expect(result[0].solDelta).toBe(-5000);

    const usdcAccount = result.find(
      (entry) => entry.pubkey === 'UserUsdcToken1111111111111111111111111111'
    );
    const rayAccount = result.find(
      (entry) => entry.pubkey === 'UserRayToken11111111111111111111111111111'
    );

    expect(usdcAccount).toBeDefined();
    expect(rayAccount).toBeDefined();

    expect(usdcAccount?.tokenDeltas).toEqual([
      {
        mint: 'USDC111111111111111111111111111111111111',
        decimals: 6,
        rawDelta: '-1000000',
        uiDelta: -1,
      },
    ]);

    expect(rayAccount?.tokenDeltas).toEqual([
      {
        mint: 'RAY1111111111111111111111111111111111111',
        decimals: 6,
        rawDelta: '1000000',
        uiDelta: 1,
      },
    ]);
  });

  it('filters out accounts with no changes (zero SOL delta and no token deltas)', () => {
    const bundle: RawTransactionBundle = {
      signature: 'test-no-change',
      slot: 455500200,
      blockTime: 1713130200,
      transaction: {
        message: {
          header: {
            numRequiredSignatures: 1,
            numReadonlySignedAccounts: 0,
            numReadonlyUnsignedAccounts: 1,
          },
        },
      },
      logMessages: [],
      preBalances: [1000000, 2000000, 3000000],
      postBalances: [1000000, 2000000, 3000000], // No changes
      preTokenBalances: [],
      postTokenBalances: [],
      innerInstructions: [],
      computeUnitsConsumed: 100,
      err: null,
      accountKeys: [
        'NoChange1111111111111111111111111111111111',
        'NoChange2222222222222222222222222222222222',
        'NoChange3333333333333333333333333333333333',
      ],
    };

    const result = computeAccountDiffs(bundle);

    expect(result).toHaveLength(0);
  });

  it('uses fallback role assignment when transaction header is missing', () => {
    const bundle: RawTransactionBundle = {
      signature: 'test-no-header',
      slot: 455500300,
      blockTime: 1713130300,
      transaction: undefined, // No header available
      logMessages: [],
      preBalances: [1000000, 2000000, 3000000],
      postBalances: [1100000, 2100000, 3000000],
      preTokenBalances: [],
      postTokenBalances: [],
      innerInstructions: [],
      computeUnitsConsumed: 100,
      err: null,
      accountKeys: [
        'Account0A1111111111111111111111111111111111',
        'Account1B2222222222222222222222222222222222',
        'Account2C3333333333333333333333333333333333',
      ],
    };

    const result = computeAccountDiffs(bundle);

    expect(result).toHaveLength(2);
    // First account should be fallback-signer (index === 0)
    expect(result[0]).toMatchObject({
      pubkey: 'Account0A1111111111111111111111111111111111',
      role: 'signer',
      solDelta: 100000,
    });
    // Second account should be fallback-writable (index > 0)
    expect(result[1]).toMatchObject({
      pubkey: 'Account1B2222222222222222222222222222222222',
      role: 'writable',
      solDelta: 100000,
    });
  });
});
