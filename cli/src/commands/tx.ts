import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';

// 1. Core logic from Services (using the alias we configured)
import { 
  fetchTransaction, 
  parseTransaction, 
  profileCU, 
  buildCPITree, 
  computeAccountDiffs, 
  mergeAnalysis, 
  analyzeTransaction
} from '@open/services';

// 2. UI/Rendering logic from CLI
import { renderJSON } from '../renderers';

export const registerTxCommand = (program: Command) => {
  program
    .command('tx <signature>')
    .description('Full analysis of a Solana transaction')
    .option('--network <type>', 'Solana network (mainnet/devnet)', 'mainnet')
    .option('--json', 'Output results in structured JSON format', true)
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
        // Note: Check if parseTransaction is receiving the correct bundle type
        const parsedLogs = parseTransaction(rawBundle!); 
        const cuProfile = profileCU(rawBundle.logMessages);
        const cpiTree = buildCPITree(rawBundle.logMessages);
        const accountDiffs = computeAccountDiffs(rawBundle);

        // Step 3: Merging all data
        const analyzed = mergeAnalysis(
          rawBundle,
          parsedLogs,
          cuProfile,
          cpiTree as any,
          accountDiffs,
          rawBundle!.logMessages as any
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

