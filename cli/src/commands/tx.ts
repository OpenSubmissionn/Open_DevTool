import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import ora from 'ora';
import chalk from 'chalk';
import type { CLIOptions } from '../types';

import {
  fetchTransaction,
  parseLogsFromBundle,
  profileCU,
  buildCPITree,
  computeAccountDiffs,
  mergeAnalysis,
  analyzeTransaction,
  IdlCache,
  McpInsightProvider,
  renderJSON,
} from '@open/services';

import { toCPITree, toParsedLogs } from '../utils/pipeline';
import { renderTerminal } from '../renderers/terminal/renderer';
import { renderCSV } from '../renderers/csv';

function nowMs() {
  return typeof process !== 'undefined' && process.hrtime
    ? Number(process.hrtime.bigint() / 1000000n)
    : Date.now();
}

function printTimings(timings: { stage: string; durationMs: number }[]) {
  const pad = (s: string) => s.padEnd(22, ' ');
  for (const t of timings) {
    console.log(
      chalk.gray('  ├─'),
      chalk.cyan(pad(t.stage)),
      chalk.yellow(`${t.durationMs.toFixed(1)} ms`)
    );
  }
  const total = timings.reduce((acc, t) => acc + t.durationMs, 0);
  console.log(chalk.gray('  └─'), chalk.bold('Total'), chalk.green(`${total.toFixed(1)} ms`));
}

export const registerTxCommand = (program: Command) => {
  program
    .command('tx <signature> [network]')
    .description(
      'Full analysis of a Solana transaction.\n\n  --verbose: Displays detailed timing for each stage in the terminal and includes timings in the JSON under _metadata.timings.'
    )
    .option('--network <type>', 'Solana network (mainnet/devnet)')
    .option('--json', 'Output results in structured JSON format', false)
    .option('--csv', 'Output a single CSV row (with header) for BI tools', false)
    .option('--output <path>', 'Write JSON/CSV output to file instead of stdout')
    .option('--no-cache', 'Skip IDL cache and force network re-fetch')
    .option('--verbose', 'Show detailed timing for each pipeline stage')
    .action(async (signature: string, networkArg: string | undefined, options: any) => {
      const isJson = options.json === true;
      const isCsv = options.csv === true;
      const isMachineOutput = isJson || isCsv;

      const originalLog = console.log;
      const originalError = console.error;

      if (isMachineOutput) {
        console.log = () => {};
        console.error = () => {};
      }

      const errorLog = (...args: any[]) => {
        if (!isMachineOutput) originalError(...args);
      };

      const timings: { stage: string; durationMs: number }[] = [];
      let t0 = nowMs();

      if (![87, 88].includes(signature.length)) {
        errorLog(chalk.red('\nError: Invalid transaction signature.'));
        process.exitCode = 1;
        return;
      }
      let t1 = nowMs();
      timings.push({ stage: 'validate_signature', durationMs: t1 - t0 });
      t0 = t1;

      const optionNetwork =
        typeof options.network === 'string' ? options.network.toLowerCase() : undefined;
      const positionalNetwork =
        typeof networkArg === 'string' ? networkArg.toLowerCase() : undefined;
      const resolvedNetwork = optionNetwork ?? positionalNetwork ?? 'devnet';

      if (resolvedNetwork !== 'mainnet' && resolvedNetwork !== 'devnet') {
        errorLog(chalk.red('\nError: Invalid network.'));
        process.exitCode = 1;
        return;
      }
      t1 = nowMs();
      timings.push({ stage: 'resolve_network', durationMs: t1 - t0 });
      t0 = t1;

      const globalOpts = program.opts();
      const verbose = globalOpts.verbose === true || options.verbose === true;
      const idlCache = new IdlCache({
        noCache: options.cache === false,
        verbose: !isMachineOutput && verbose,
      });
      t1 = nowMs();
      timings.push({ stage: 'init_idl_cache', durationMs: t1 - t0 });
      t0 = t1;

      const spinner = ora(`Initializing Open Insight Pipeline...`);
      if (!isMachineOutput) spinner.start();

      try {
        spinner.text = chalk.cyan('Fetching transaction bundle...');
        const selectedNetwork = resolvedNetwork as CLIOptions['network'];
        const fetchStart = nowMs();
        const rawBundle = await fetchTransaction(signature, selectedNetwork);
        const fetchEnd = nowMs();
        timings.push({ stage: 'fetch_transaction', durationMs: fetchEnd - fetchStart });
        t0 = fetchEnd;

        const anchorStart = nowMs();
        const { Connection } = await import('@solana/web3.js');
        const { AnchorProvider } = await import('@coral-xyz/anchor');
        const rpcUrl =
          resolvedNetwork === 'mainnet'
            ? 'https://api.mainnet-beta.solana.com'
            : 'https://api.devnet.solana.com';
        const anchorProvider = new AnchorProvider(
          new Connection(rpcUrl, 'confirmed'),
          {
            publicKey: null,
            signTransaction: async (tx: any) => tx,
            signAllTransactions: async (txs: any) => txs,
          } as any,
          { commitment: 'confirmed' }
        );
        const anchorEnd = nowMs();
        timings.push({ stage: 'init_anchor_provider', durationMs: anchorEnd - anchorStart });
        t0 = anchorEnd;

        spinner.text = chalk.cyan('Parsing logs and CU...');
        const parseStart = nowMs();
        const parsedLogSummary = parseLogsFromBundle(rawBundle.logMessages);
        const cuProfile = profileCU(rawBundle.logMessages);
        const cpiTrace = buildCPITree(rawBundle.logMessages);
        const cpiTree = toCPITree(cpiTrace);
        const accountDiffs = computeAccountDiffs(rawBundle);
        const parseEnd = nowMs();
        timings.push({ stage: 'parse_logs_and_cu', durationMs: parseEnd - parseStart });
        t0 = parseEnd;

        spinner.text = chalk.cyan('Decoding instructions...');
        const decodeStart = nowMs();
        const analyzed = await mergeAnalysis(
          rawBundle,
          toParsedLogs(rawBundle.logMessages, parsedLogSummary),
          cuProfile,
          cpiTree,
          accountDiffs,
          { idlCache, anchorProvider }
        );
        const decodeEnd = nowMs();
        timings.push({ stage: 'decode_instructions', durationMs: decodeEnd - decodeStart });
        t0 = decodeEnd;

        spinner.text = chalk.cyan('Generating actionable insights...');
        const insightsStart = nowMs();
        const mcpProvider = new McpInsightProvider();
        const insightsReport = await analyzeTransaction(analyzed, [mcpProvider]);
        const insightsEnd = nowMs();
        timings.push({ stage: 'analyze_transaction', durationMs: insightsEnd - insightsStart });
        t0 = insightsEnd;

        if (!isMachineOutput) {
          spinner.succeed(chalk.green('Analysis Complete!'));
          if (verbose) process.nextTick(() => idlCache.printMetrics());
        }

        const outputStart = nowMs();
        if (isJson) {
          if (!analyzed._metadata) analyzed._metadata = {};
          analyzed._metadata.timings = timings;
          const jsonOut = renderJSON(analyzed, insightsReport);
          if (options.output) {
            const outPath = path.resolve(options.output);
            fs.writeFileSync(outPath, jsonOut, 'utf-8');
            originalLog(`\nReport written to: ${outPath}`);
            return;
          }
          process.stdout.write(jsonOut);
          return;
        }
        if (isCsv) {
          const csvOut = renderCSV(analyzed, insightsReport) + '\n';
          const defaultName = `${signature}.csv`;
          if (options.output) {
            const outPath = path.resolve(options.output);
            fs.writeFileSync(outPath, csvOut, 'utf-8');
            originalLog(`\nCSV written to: ${outPath}`);
            return;
          }
          // If no explicit output path, write file named <signature>.csv in cwd
          const outPath = path.resolve(defaultName);
          fs.writeFileSync(outPath, csvOut, 'utf-8');
          originalLog(`\nCSV written to: ${outPath}`);
          return;
        }

        renderTerminal(analyzed, insightsReport, selectedNetwork);
        const outputEnd = nowMs();
        timings.push({ stage: 'render_terminal', durationMs: outputEnd - outputStart });

        if (verbose) {
          console.log(chalk.bold.cyan('\n[Pipeline Timings]'));
          printTimings(timings);
        }
      } catch (error: any) {
        if (isJson) {
          process.stdout.write(JSON.stringify({ error: error.message }, null, 2));
        } else if (isCsv) {
          process.stdout.write(`error,${error.message?.replace(/"/g, '""') ?? ''}\n`);
        } else {
          spinner.fail(chalk.red('Pipeline Crash'));
          console.error(chalk.yellow(`\nDetail: ${error.message}`));
          if (verbose) {
            idlCache.printMetrics();
          }
        }
        process.exitCode = 1;
      } finally {
        console.log = originalLog;
        console.error = originalError;
      }
    });
};
