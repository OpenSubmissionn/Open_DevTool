import { Command } from 'commander';
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

export const registerTxCommand = (program: Command) => {
  program
    .command('tx <signature> [network]')
    .description('Full analysis of a Solana transaction')
    .option('--network <type>', 'Solana network (mainnet/devnet)')
    .option('--json', 'Output results in structured JSON format', false)
    .option('--no-cache', 'Skip IDL cache and force network re-fetch')
    .action(async (signature: string, networkArg: string | undefined, options: any) => {
      const isJson = options.json === true;

      const originalLog = console.log;
      const originalError = console.error;

      if (isJson) {
        console.log = () => {};
        console.error = () => {};
      }

      const errorLog = (...args: any[]) => {
        if (!isJson) originalError(...args);
      };

      if (![87, 88].includes(signature.length)) {
        errorLog(chalk.red('\nError: Invalid transaction signature.'));
        process.exitCode = 1;
        return;
      }

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

      const globalOpts = program.opts();
      const verbose = globalOpts.verbose === true;
      const idlCache = new IdlCache({
        noCache: options.cache === false,
        verbose: !isJson && verbose,
      });

      const spinner = ora(`Initializing Open Insight Pipeline...`);
      if (!isJson) spinner.start();

      try {
        spinner.text = chalk.cyan('Fetching transaction bundle...');
        const selectedNetwork = resolvedNetwork as CLIOptions['network'];
        const rawBundle = await fetchTransaction(signature, selectedNetwork);

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

        spinner.text = chalk.cyan('Parsing logs and CU...');
        const parsedLogSummary = parseLogsFromBundle(rawBundle.logMessages);
        const cuProfile = profileCU(rawBundle.logMessages);
        const cpiTrace = buildCPITree(rawBundle.logMessages);
        const cpiTree = toCPITree(cpiTrace);
        const accountDiffs = computeAccountDiffs(rawBundle);

        spinner.text = chalk.cyan('Decoding instructions...');
        const analyzed = await mergeAnalysis(
          rawBundle,
          toParsedLogs(rawBundle.logMessages, parsedLogSummary),
          cuProfile,
          cpiTree,
          accountDiffs,
          { idlCache, anchorProvider }
        );

        spinner.text = chalk.cyan('Generating actionable insights...');
        const mcpProvider = new McpInsightProvider();
        const insightsReport = await analyzeTransaction(analyzed, [mcpProvider]);

        if (!isJson) {
          spinner.succeed(chalk.green('Analysis Complete!'));
          if (verbose) process.nextTick(() => idlCache.printMetrics());
        }

        if (isJson) {
          process.stdout.write(renderJSON(analyzed, insightsReport));
          return;
        }

        renderTerminal(analyzed, insightsReport, selectedNetwork);
      } catch (error: any) {
        if (isJson) {
          process.stdout.write(JSON.stringify({ error: error.message }, null, 2));
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
