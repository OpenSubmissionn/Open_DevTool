import * as fs from 'fs';
import * as path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

import {
  fetchTransaction,
  parseLogsFromBundle,
  profileCU,
  buildCPITree,
  computeAccountDiffs,
  mergeAnalysis,
  analyzeTransaction,
  McpInsightProvider,
  type AnalyzedTransaction,
  type InsightReport,
} from '@open/services';

import { toCPITree, toParsedLogs } from '../utils/pipeline';
import { aggregateBatch, type BatchEntry, type BatchReport } from '@open/services';

// ── Batch file schema ─────────────────────────────────────────────────────────

interface BatchFile {
  network?: 'mainnet' | 'devnet';
  rpcUrl?: string;
  signatures: string[];
}

function loadBatchFile(filePath: string): BatchFile {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Batch file not found: ${resolved}`);
  }

  let raw: string;
  try {
    raw = fs.readFileSync(resolved, 'utf-8');
  } catch {
    throw new Error(`Failed to read batch file: ${resolved}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in batch file: ${resolved}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Batch file must be a JSON object with a "signatures" array.');
  }

  const obj = parsed as Record<string, unknown>;

  if (!Array.isArray(obj.signatures) || obj.signatures.length === 0) {
    throw new Error('Batch file must contain a non-empty "signatures" array.');
  }

  for (let i = 0; i < obj.signatures.length; i++) {
    if (typeof obj.signatures[i] !== 'string') {
      throw new Error(`signatures[${i}] must be a string.`);
    }
  }

  const net = obj.network;
  if (net !== undefined && net !== 'mainnet' && net !== 'devnet') {
    throw new Error(`Invalid "network" value: "${net}". Must be "mainnet" or "devnet".`);
  }

  return {
    network: (net as 'mainnet' | 'devnet' | undefined) ?? 'mainnet',
    rpcUrl: typeof obj.rpcUrl === 'string' ? obj.rpcUrl : undefined,
    signatures: obj.signatures as string[],
  };
}

// ── Pipeline for a single transaction ─────────────────────────────────────────

async function analyzeSingle(
  signature: string,
  network: 'mainnet' | 'devnet'
): Promise<{ analyzed: AnalyzedTransaction; insights: InsightReport } | null> {
  try {
    const rawBundle = await fetchTransaction(signature, network);
    const logSummary = parseLogsFromBundle(rawBundle.logMessages);
    const cuProfile = profileCU(rawBundle.logMessages);
    const cpiTrace = buildCPITree(rawBundle.logMessages);
    const cpiTree = toCPITree(cpiTrace);
    const accountDiffs = computeAccountDiffs(rawBundle);
    const logs = toParsedLogs(rawBundle.logMessages, logSummary);

    const analyzed = await mergeAnalysis(rawBundle, logs, cuProfile, cpiTree, accountDiffs);
    const mcpProvider = new McpInsightProvider();
    const insights = await analyzeTransaction(analyzed, [mcpProvider]);

    return { analyzed, insights };
  } catch {
    return null;
  }
}

// ── Terminal batch report renderer ────────────────────────────────────────────

const WIDTH = 100;
const line = (char = '─') => char.repeat(WIDTH);

function renderBatchReport(report: BatchReport, verbose: boolean): void {
  const { summary, costs, patterns, frameworkTrends, globalRecommendations, transactions } = report;

  const successColor = summary.failed === 0 ? chalk.green : chalk.yellow;

  console.log('');
  console.log(`  ${chalk.cyan.bold('OPEN INSIGHT [BATCH REPORT v0.1.0]')}`);
  console.log(`  ┌${line('─')}┐`);
  console.log(
    `  │ ${chalk.bold('Network:')} ${chalk.blue(summary.network.toUpperCase())}   ` +
      `${chalk.bold('Transactions:')} ${successColor(summary.successful + '/' + summary.total)} success` +
      (summary.failed > 0 ? chalk.red(`  (${summary.failed} failed)`) : '')
  );
  console.log(`  │ ${chalk.gray('Processed at: ' + summary.processedAt)}`);
  console.log(`  └${line('─')}┘`);

  // Cost summary
  console.log('');
  console.log(`  ┌${line('─')}┐`);
  console.log(`  │ ${chalk.cyan.bold('COST SUMMARY')}`);
  console.log(
    `  │  Total fees:  ${chalk.yellow(costs.totalFeeSOL.toFixed(9))} SOL` +
      (costs.totalFeeUSD != null ? chalk.green(`  ($${costs.totalFeeUSD.toFixed(4)})`) : '')
  );
  console.log(
    `  │  Total CU:    ${chalk.cyan(costs.totalCU.toLocaleString())}  ·  ` +
      `Avg: ${chalk.cyan(costs.avgCU.toLocaleString())} CU/tx`
  );
  console.log(
    `  │  Avg fee:     ${chalk.yellow(costs.avgFeeLamports.toLocaleString())} lamports/tx`
  );
  console.log(`  └${line('─')}┘`);

  // Recurring patterns
  if (patterns.length > 0) {
    console.log('');
    console.log(`  ┌${line('─')}┐`);
    console.log(`  │ ${chalk.cyan.bold('RECURRING PATTERNS')}`);
    for (const p of patterns.slice(0, 5)) {
      const severityColor =
        p.severity === 'critical'
          ? chalk.red
          : p.severity === 'warning'
            ? chalk.yellow
            : chalk.gray;
      const bar = '█'.repeat(Math.round(p.percentage / 5));
      console.log(
        `  │  ${severityColor(p.type.padEnd(35))} ${chalk.white(p.frequency + 'x')}  ` +
          `${chalk.gray(bar)} ${p.percentage}%`
      );
    }
    console.log(`  └${line('─')}┘`);
  }

  // Framework trends
  if (frameworkTrends.length > 0) {
    console.log('');
    console.log(`  ┌${line('─')}┐`);
    console.log(`  │ ${chalk.cyan.bold('FRAMEWORK TRENDS')}`);
    for (const f of frameworkTrends) {
      console.log(
        `  │  ${chalk.white(f.framework.padEnd(12))} ${f.count}tx  ${f.percentage}%  ` +
          `· avg ${chalk.cyan(f.avgCU.toLocaleString())} CU`
      );
    }
    console.log(`  └${line('─')}┘`);
  }

  // Global recommendations
  console.log('');
  console.log(`  ╔${line('═')}╗`);
  console.log(`  ║ ${chalk.yellow.bold('GLOBAL RECOMMENDATIONS')}`);
  for (const rec of globalRecommendations) {
    console.log(`  ║  ${chalk.yellow('→')} ${rec}`);
  }
  console.log(`  ╚${line('═')}╝`);

  // Per-transaction table (verbose or compact)
  if (verbose) {
    console.log('');
    console.log(`  ${chalk.bold('TRANSACTIONS')}`);
    for (const tx of transactions) {
      const icon = tx.success ? chalk.green('✓') : chalk.red('✗');
      const sig = tx.signature.slice(0, 8) + '...' + tx.signature.slice(-6);
      const insight = tx.topInsight ? chalk.gray(` → ${tx.topInsight.slice(0, 50)}`) : '';
      console.log(
        `  ${icon}  ${chalk.white(sig)}  ` +
          `${chalk.cyan(tx.cuConsumed.toLocaleString())} CU  ` +
          `${tx.feeLamports.toLocaleString()} lam  ` +
          `${tx.insightCount} insight(s)${insight}`
      );
    }
  }

  console.log('');
}

// ── Command registration ──────────────────────────────────────────────────────

export const registerBatchCommand = (program: Command) => {
  program
    .command('batch <file>')
    .description('Analyze multiple transactions from a JSON file and generate an aggregated report')
    .option('--json', 'Output full report as structured JSON', false)
    .option('--output <path>', 'Write JSON report to file instead of stdout')
    .option('--concurrency <n>', 'Max parallel transactions to process', '3')
    .action(async (file: string, options: any) => {
      const globalOpts = program.opts();
      const verbose = globalOpts.verbose === true;

      // Load and validate batch file
      let batchFile: BatchFile;
      try {
        batchFile = loadBatchFile(file);
      } catch (err: any) {
        console.error(chalk.red(`\nError: ${err.message}`));
        process.exitCode = 1;
        return;
      }

      const { signatures, network = 'mainnet' } = batchFile;
      const concurrency = Math.max(1, Math.min(10, parseInt(options.concurrency, 10) || 3));

      console.log(
        chalk.cyan(
          `\nProcessing ${signatures.length} transaction(s) on ${network} (concurrency: ${concurrency})...`
        )
      );

      const spinner = ora('Analyzing transactions...').start();
      const entries: BatchEntry[] = [];
      const failed: string[] = [];

      // Process in batches respecting concurrency limit
      for (let i = 0; i < signatures.length; i += concurrency) {
        const slice = signatures.slice(i, i + concurrency);
        spinner.text = `Analyzing ${i + 1}–${Math.min(i + concurrency, signatures.length)} of ${signatures.length}...`;

        const results = await Promise.all(slice.map((sig) => analyzeSingle(sig, network)));

        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          if (result) {
            entries.push(result);
          } else {
            failed.push(slice[j]);
          }
        }
      }

      spinner.succeed(
        chalk.green(`Processed ${entries.length}/${signatures.length} transactions.`) +
          (failed.length > 0 ? chalk.red(` (${failed.length} failed)`) : '')
      );

      if (failed.length > 0 && verbose) {
        console.log(chalk.yellow('\nFailed signatures:'));
        for (const sig of failed) console.log(`  - ${sig}`);
      }

      if (entries.length === 0) {
        console.error(chalk.red('\nNo transactions could be analyzed.'));
        process.exitCode = 1;
        return;
      }

      const report = aggregateBatch(entries, network);

      if (options.json || options.output) {
        const json = JSON.stringify(report, null, 2);
        if (options.output) {
          const outPath = path.resolve(options.output);
          fs.writeFileSync(outPath, json, 'utf-8');
          console.log(chalk.green(`\nReport written to: ${outPath}`));
        } else {
          console.log(json);
        }
        return;
      }

      renderBatchReport(report, verbose);
    });
};
