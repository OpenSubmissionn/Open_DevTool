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
  type CPITree,
  type ParsedLogs
} from '@open/services';
 
// JSON renderer
import { renderJSON } from '@open/services';
 
// Terminal renderer (no Ink)
import { renderTerminal } from '../renderers/terminal/renderer';
 
function toCPITree(trace: ReturnType<typeof buildCPITree>): CPITree {
  const totalDepth = trace.roots.reduce(
    (maxDepth, node) => Math.max(maxDepth, node.depth),
    0
  );
 
  return {
    root: trace.roots.map((node) => ({
      programId: node.programId,
      programName: node.programId,
      depth: node.depth,
      status: node.status === 'failed' ? 'failed' : 'success',
      cuConsumed: node.computeUnitsConsumed,
      children: [],
    })),
    totalDepth,
    nodeCount: trace.roots.length,
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
 
      const spinner = ora(`Initializing Open Insight Pipeline...`).start();
 
      try {
        // Step 1: Fetch
        spinner.text = chalk.cyan('Fetching transaction bundle...');
        const selectedNetwork = resolvedNetwork as CLIOptions['network'];
        const rawBundle = await fetchTransaction(signature, selectedNetwork);
 
        // Step 2: Analysis
        spinner.text = chalk.cyan('Parsing logs and CU...');
        const parsedLogSummary = parseLogsFromBundle(rawBundle.logMessages);
        const cuProfile = profileCU(rawBundle.logMessages);
        const cpiTrace = buildCPITree(rawBundle.logMessages);
        const cpiTree = toCPITree(cpiTrace);
        const accountDiffs = computeAccountDiffs(rawBundle);

        // Step 3: Merging all data
        const analyzed = await mergeAnalysis(
          rawBundle,
          toParsedLogs(rawBundle.logMessages, parsedLogSummary),
          cuProfile,
          cpiTree,
          accountDiffs
        );

        // Step 4: Rule-based Intelligence
        spinner.text = chalk.cyan('Generating actionable insights...');
        const insightsReport = await analyzeTransaction(analyzed);

        spinner.succeed(chalk.green('Analysis Complete!'));
 
        // Step 5: Output
        if (options.json) {
          console.log(renderJSON(analyzed, insightsReport));
          return;
        }
 
        // Render terminal output (no Ink, no double render)
        renderTerminal(analyzed, insightsReport, selectedNetwork);
 
      } catch (error: any) {
        spinner.fail(chalk.red('Pipeline Crash'));
        console.error(chalk.yellow(`\nDetail: ${error.message}`));
        process.exitCode = 1;
      }
    });
};