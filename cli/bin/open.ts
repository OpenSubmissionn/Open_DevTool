#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig } from '../src/config/loader';
import { registerTxCommand } from '../src/commands/tx';
import { registerConfigCommand } from '../src/commands/config';
import { registerInfoCommand } from '../src/commands/info';
 
// tsx on Windows/CommonJS runs the file twice — this blocks the second execution
const guardKey = '__OPEN_CLI_STARTED__';
if ((global as any)[guardKey]) process.exit(0);
(global as any)[guardKey] = true;

// 1. Load environment configuration early
loadConfig();

// 2. Initialize CLI program
const program = new Command();

// 3. Set CLI metadata
program
  .name('open')
  .description('OPEN - Solana Observability and CU Analysis CLI')
  .version('0.1.0')
  .option('--verbose', 'Enable debug logging', false);

// 4. Register commands
registerTxCommand(program);
registerConfigCommand(program);
registerInfoCommand(program);

// 5. Parse arguments
program.parse(process.argv);
