import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';

// 1. Core logic from Services (using the alias we configured)
import { 
  fetchTransaction, 
  parseTransaction, 
  parseLogsFromBundle,
  profileCU, 
  buildCPITree, 
  computeAccountDiffs, 
  mergeAnalysis, 
  analyzeTransaction,
  type CPITree,
  type ParsedLogs
} from '@open/services';

// 2. JSON rendering output
import { renderJSON } from '@open/services';

function toCPITree(trace: ReturnType<typeof buildCPITree>): CPITree {
  const totalDepth = trace.roots.reduce((maxDepth, node) => Math.max(maxDepth, node.depth), 0);

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

function toParsedLogs(logMessages: string[], parsed: ReturnType<typeof parseLogsFromBundle>): ParsedLogs {
  return {
    raw: logMessages,
    entries: [],
    byProgram: Object.keys(parsed.byProgram).map((programId) => ({
      programId,
      programName: programId,
      entries: [],
      cuConsumed: parsed.byProgram[programId]?.consumed,
    })),
    errors: parsed.errors.map((error) => ({
      raw: error,
      type: 'failed',
      message: error,
    })),
    totalLines: parsed.totalLines,
  };
}

export const registerTxCommand = (program: Command) => {
  program
    .command('tx <signature>')
    .description('Full analysis of a Solana transaction')
    .option('--network <type>', 'Solana network (mainnet/devnet)', 'mainnet')
    .option('--json', 'Output results in structured JSON format', false)
    .action(async (signature: string, options: any) => {
      
      // Basic signature validation
      if (![87, 88].includes(signature.length)) {
        console.error(chalk.red('\nError: Invalid transaction signature.'));
        process.exit(1);
      }

      const spinner = ora(`Initializing Open Insight Pipeline...`).start();

      try {
        // Step 1: Fetch raw data
        spinner.text = chalk.cyan('Fetching transaction bundle from RPC...');
        const rawBundle = await fetchTransaction(signature);

        // Step 2: Running parallel analysis modules
        spinner.text = chalk.cyan('Parsing logs and compute units...');
        const parsedTx = parseTransaction(rawBundle);
        const parsedLogSummary = parseLogsFromBundle(rawBundle.logMessages);
        const cuProfile = profileCU(rawBundle.logMessages);
        const cpiTrace = buildCPITree(rawBundle.logMessages);
        const cpiTree = toCPITree(cpiTrace);
        const accountDiffs = computeAccountDiffs(rawBundle);

        // Step 3: Merging all data
        const analyzed = mergeAnalysis(
          rawBundle,
          parsedTx,
          cuProfile,
          cpiTree,
          accountDiffs,
          toParsedLogs(rawBundle.logMessages, parsedLogSummary)
        );

        // Step 4: Rule-based Intelligence
        spinner.text = chalk.cyan('Generating actionable insights...');
        const insightsReport = analyzeTransaction(analyzed);

        spinner.succeed(chalk.green('Analysis Complete!'));

        // Step 5: Render (Using the CLI renderer we just populated)
        // Pass the full report or just insights array as needed by your renderJSON
        const finalOutput = renderJSON(analyzed, insightsReport);
        
        console.log(finalOutput);

      } catch (error: any) {
        spinner.fail(chalk.red('Pipeline Crash'));
        console.error(chalk.yellow(`\nDetail: ${error.message}`));
        process.exit(1);
      }
    });
};

