// Detect JSON mode as early as possible (before any imports execute side effects)
const isJsonMode = process.argv.includes('--json');

// Silence all console output in JSON mode to ensure pure machine-readable output
if (isJsonMode) {
  const noop = () => {};
  console.log = noop;
  console.error = noop;
  console.warn = noop; // this was the missing piece
}

// Safe to import modules after silencing logs
import { Command } from 'commander';
import { loadConfig } from '../src/config/loader';
import { registerTxCommand } from '../src/commands/tx';
import { registerConfigCommand } from '../src/commands/config';

// Prevent double execution caused by tsx on Windows/CommonJS environments
const guardKey = '__OPEN_CLI_STARTED__';
if ((global as any)[guardKey]) process.exit(0);
(global as any)[guardKey] = true;

// 1. Load environment configuration early
loadConfig();

// 2. Initialize CLI program
const program = new Command();

// 3. Define CLI metadata and global options
program
  .name('open')
  .description('OPEN - Solana Observability and CU Analysis CLI')
  .version('0.1.0')
  .option('--verbose', 'Enable debug logging', false);

// 4. Register CLI commands
registerTxCommand(program);
registerConfigCommand(program);

// 5. Parse CLI arguments and execute commands
program.parse(process.argv);
