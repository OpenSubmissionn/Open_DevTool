import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import type { CLIOptions } from '../types';

// Core services
import {
  fetchTransaction,
  parseLogsFromBundle,
  profileCU,
  buildCPITree,
  computeAccountDiffs,
  mergeAnalysis,
  analyzeTransaction,
  IdlCache,
  type CPITree,
  type ParsedLogs,
} from '@open/services';     

// MCP Integration
import { McpInsightProvider } from '@open/services';

// JSON rendering output
import { renderJSON } from '@open/services';

// Terminal renderer (no Ink)
import { renderTerminal } from '../renderers/terminal/renderer';

function toCPITree(trace: ReturnType<typeof buildCPITree>): CPITree {
  const toNode = (node: (typeof trace.roots)[number]): CPITree['root'][number] => ({
    programId: node.programId,
    programName: node.programId,
    depth: node.depth,
    status: node.status === 'success' ? 'success' : 'failed',
    cuConsumed: node.computeUnitsConsumed,
    children: node.children.map(toNode),
  });

  const visit = (
    node: (typeof trace.roots)[number],
    acc: { maxDepth: number; count: number }
  ): void => {
    acc.maxDepth = Math.max(acc.maxDepth, node.depth);
    acc.count += 1;
    for (const child of node.children) {
      visit(child, acc);
    }
  };

  const metrics = { maxDepth: 0, count: 0 };
  for (const root of trace.roots) {
    visit(root, metrics);
  }

  return {
    root: trace.roots.map(toNode),
    totalDepth: metrics.maxDepth,
    nodeCount: metrics.count,
  };
}

function toParsedLogs(
  logMessages: string[],
  parsed: ReturnType<typeof parseLogsFromBundle>
): ParsedLogs {
  return {
    raw: logMessages,
    entries: [],
    byProgram: Object.keys(parsed.byProgram).map((programId) => ({
      programId,
      programName: programId,
      entries: [],
      cuConsumed: parsed.byProgram[programId]?.consumed,
    })),
    errors: parsed.errors,
    totalLines: parsed.totalLines,
  };
}

export const registerTxCommand = (program: Command) => {
  program
    .command('tx <signature> [network]')
    .description('Full analysis of a Solana transaction')
    .option('--network <type>', 'Solana network (mainnet/devnet)')
    .option('--json', 'Output results in structured JSON format', false)
    .option('--no-cache', 'Skip IDL cache and force network re-fetch')
    .action(async (signature: string, networkArg: string | undefined, options: any) => {

      // Validate signature
      if (![87, 88].includes(signature.length)) {
        console.error(chalk.red('\nError: Invalid transaction signature.'));
        process.exitCode = 1;
        return;
      }

      const optionNetwork =
        typeof options.network === 'string' ? options.network.toLowerCase() : undefined;

      const positionalNetwork =
        typeof networkArg === 'string' ? networkArg.toLowerCase() : undefined;

      const resolvedNetwork = optionNetwork ?? positionalNetwork ?? 'devnet';

      if (resolvedNetwork !== 'mainnet' && resolvedNetwork !== 'devnet') {
        console.error(chalk.red('\nError: Invalid network.'));
        process.exitCode = 1;
        return;
      }

      // [NEW] Create one IdlCache instance for the lifetime of this command.
      // noCache=true when --no-cache is passed; verbose=true when --verbose is passed.
      const globalOpts = program.opts();
      const verbose = globalOpts.verbose === true;
      console.log('[debug] globalOpts.verbose:', globalOpts.verbose);
      const idlCache = new IdlCache({
        noCache: options.cache === false,   // commander inverts --no-cache → options.cache
        verbose,
      });

      const spinner = ora(`Initializing Open Insight Pipeline...`).start();

      try {
        // Step 1: Fetch
        spinner.text = chalk.cyan('Fetching transaction bundle...');
        const selectedNetwork = resolvedNetwork as CLIOptions['network'];
        const rawBundle = await fetchTransaction(signature, selectedNetwork);

        // [NEW] AnchorProvider read-only para buscar IDLs on-chain de programas desconhecidos.
        const { Connection } = await import('@solana/web3.js');
        const { AnchorProvider } = await import('@coral-xyz/anchor');
        const rpcUrl = resolvedNetwork === 'mainnet'
          ? 'https://api.mainnet-beta.solana.com'
          : 'https://api.devnet.solana.com';
        const anchorProvider = new AnchorProvider(
          new Connection(rpcUrl, 'confirmed'),
          { publicKey: null, signTransaction: async (tx: any) => tx, signAllTransactions: async (txs: any) => txs } as any,
          { commitment: 'confirmed' }
        );

        // Step 2: Analysis
        spinner.text = chalk.cyan('Parsing logs and CU...');
        const parsedLogSummary = parseLogsFromBundle(rawBundle.logMessages);
        const cuProfile = profileCU(rawBundle.logMessages);
        const cpiTrace = buildCPITree(rawBundle.logMessages);
        const cpiTree = toCPITree(cpiTrace);
        const accountDiffs = computeAccountDiffs(rawBundle);

        // [NEW] idlCache is forwarded so mergeAnalysis → parseTransaction can
        //       decode Anchor instruction names without a network round-trip.
        spinner.text = chalk.cyan('Decoding instructions...');
        const analyzed = await mergeAnalysis(
          rawBundle,
          toParsedLogs(rawBundle.logMessages, parsedLogSummary),
          cuProfile,
          cpiTree,
          accountDiffs,
          { idlCache, anchorProvider },  
        );

        // Step 4: Rule-based Intelligence + MCP Integration
        spinner.text = chalk.cyan('Generating actionable insights...');
        const mcpProvider = new McpInsightProvider();
        const insightsReport = await analyzeTransaction(analyzed, mcpProvider);

        spinner.succeed(chalk.green('Analysis Complete!'));
        if (verbose) {
          process.nextTick(() => idlCache.printMetrics());
        }

        // Step 5: Output
        if (options.json) {
          console.log(renderJSON(analyzed, insightsReport));
          return;
        }

        renderTerminal(analyzed, insightsReport, selectedNetwork);

      } catch (error: any) {
        spinner.fail(chalk.red('Pipeline Crash'));
        console.error(chalk.yellow(`\nDetail: ${error.message}`));

        // [NEW] Still print metrics on error so cache behaviour is observable.
        if (verbose) {
          idlCache.printMetrics();
        }

        process.exitCode = 1;
      }
    });
};