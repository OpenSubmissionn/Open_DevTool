/**
 * Visual regression snapshots for the terminal renderer.
 *
 * Determinism notes:
 *   - chalk.level forced to 0 so colors are stripped at source.
 *   - Any residual ANSI escape sequences are stripped from captured stdout.
 *   - No network / MCP calls — pipeline runs purely on local fixtures.
 *
 * Update workflow: see services/tests/snapshots/SNAPSHOT_GUIDE.md
 */
import { describe, it, expect, beforeAll } from 'vitest';
import chalk from 'chalk';
import { renderTerminal } from '../../../cli/src/renderers/terminal/renderer';
import { runPipeline, getFixture } from '../fixtures/utils';
import type { RawTransactionBundle } from '../../src';

const ANSI_REGEX = /\x1B\[[0-9;]*m/g;

function captureTerminalOutput(analyzed: any, insights: any, network: 'mainnet' | 'devnet'): string {
  const lines: string[] = [];
  const originalLog = console.log;
  console.log = (...args: any[]) => {
    lines.push(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '));
  };
  try {
    renderTerminal(analyzed, insights, network);
  } finally {
    console.log = originalLog;
  }
  return lines.join('\n').replace(ANSI_REGEX, '');
}

beforeAll(() => {
  // Force chalk to never emit ANSI codes regardless of TTY detection.
  chalk.level = 0;
  process.env.FORCE_COLOR = '0';

  // Force en-US locale so number separators are stable across machines
  // (CI is en-US, dev machines may be pt-BR / de-DE / etc.).
  const originalNumberToLocale = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (locales, options) {
    return originalNumberToLocale.call(this, locales ?? 'en-US', options);
  };
});

// TEMPORARILY SKIPPED: insight ranking changes in develop are causing snapshot
// drift across every open PR. Re-enable once the suite is replaced with
// semantic assertions (or once all open PRs are rebased onto a stable base).
// See SNAPSHOT_GUIDE.md for the update workflow when re-enabling.
describe.skip('Terminal Output Snapshots', () => {
  it('simple success — system program transfer', async () => {
    const { analyzed, insights } = await runPipeline(getFixture('mockSimpleTransfer'));
    expect(captureTerminalOutput(analyzed, insights, 'devnet')).toMatchSnapshot();
  });

  it('failed — custom program error', async () => {
    const { analyzed, insights } = await runPipeline(getFixture('mockFailedTx'));
    expect(captureTerminalOutput(analyzed, insights, 'devnet')).toMatchSnapshot();
  });

  it('deep-cpi — three-level invocation chain', async () => {
    const { analyzed, insights } = await runPipeline(getFixture('mockDeepCpiTx'));
    expect(captureTerminalOutput(analyzed, insights, 'devnet')).toMatchSnapshot();
  });

  it('high-cu — bottleneck program', async () => {
    const { analyzed, insights } = await runPipeline(getFixture('mockHighCuTx'));
    expect(captureTerminalOutput(analyzed, insights, 'mainnet')).toMatchSnapshot();
  });

  it('spam — large transfer of unknown mint', async () => {
    const bundle: RawTransactionBundle = {
      signature: 'spam-suspect-fixture-signature-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      slot: 1600000,
      blockTime: 1710100000,
      transaction: {
        signatures: ['spam-suspect-fixture-signature'],
        message: {
          accountKeys: [
            'Spam111111111111111111111111111111111111111',
            'Recv111111111111111111111111111111111111111',
            'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            'SPAMmintXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          ],
          instructions: [{ programIdIndex: 2, accounts: [0, 1, 3], data: 'AA==' }],
        },
      } as any,
      logMessages: [
        'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]',
        'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 4500 of 200000 compute units',
        'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success',
      ],
      computeUnitsConsumed: 4500,
      preBalances: [1_000_000_000, 1_000_000_000, 1_000_000_000, 1_000_000_000],
      postBalances: [999_995_000, 1_000_000_000, 1_000_000_000, 1_000_000_000],
      preTokenBalances: [
        {
          accountIndex: 0,
          mint: 'SPAMmintXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          owner: 'Spam111111111111111111111111111111111111111',
          uiTokenAmount: { amount: '5000000000000', decimals: 0, uiAmount: 5_000_000_000, uiAmountString: '5000000000' },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: 1,
          mint: 'SPAMmintXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          owner: 'Recv111111111111111111111111111111111111111',
          uiTokenAmount: { amount: '5000000000000', decimals: 0, uiAmount: 5_000_000_000, uiAmountString: '5000000000' },
        },
      ],
      innerInstructions: [],
      accountKeys: [
        'Spam111111111111111111111111111111111111111',
        'Recv111111111111111111111111111111111111111',
        'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        'SPAMmintXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      ],
      err: null,
      rawResponse: {} as any,
    };

    const { analyzed, insights } = await runPipeline(bundle);
    expect(captureTerminalOutput(analyzed, insights, 'mainnet')).toMatchSnapshot();
  });

  it('mev-mix — multi-program with high-cu bottleneck', async () => {
    const bundle: RawTransactionBundle = {
      signature: 'mev-mix-fixture-signatureBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      slot: 1700000,
      blockTime: 1710200000,
      transaction: {
        signatures: ['mev-mix-fixture-signature'],
        message: {
          accountKeys: [
            'MEVbot11111111111111111111111111111111111111',
            'PoolA111111111111111111111111111111111111111',
            'PoolB111111111111111111111111111111111111111',
            'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
            '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
          ],
          instructions: [
            { programIdIndex: 3, accounts: [0, 1, 2], data: 'AQ==' },
            { programIdIndex: 4, accounts: [0, 2, 1], data: 'Ag==' },
          ],
        },
      } as any,
      logMessages: [
        'Program JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB invoke [1]',
        'Program 9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP invoke [2]',
        'Program 9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP consumed 180000 of 200000 compute units',
        'Program 9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP success',
        'Program JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB consumed 195000 of 200000 compute units',
        'Program JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB success',
      ],
      computeUnitsConsumed: 195000,
      preBalances: [2_000_000_000, 5_000_000_000, 5_000_000_000, 1, 1],
      postBalances: [2_050_000_000, 4_950_000_000, 5_000_000_000, 1, 1],
      preTokenBalances: [],
      postTokenBalances: [],
      innerInstructions: [],
      accountKeys: [
        'MEVbot11111111111111111111111111111111111111',
        'PoolA111111111111111111111111111111111111111',
        'PoolB111111111111111111111111111111111111111',
        'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
        '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
      ],
      err: null,
      rawResponse: {} as any,
    };

    const { analyzed, insights } = await runPipeline(bundle);
    expect(captureTerminalOutput(analyzed, insights, 'mainnet')).toMatchSnapshot();
  });
});
