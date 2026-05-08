#!/usr/bin/env node

// Guard Node.js version before any runtime code loads.
const minNodeMajor = 18;
const nodeMajor = Number(process.versions.node.split('.')[0] || 0);
if (nodeMajor < minNodeMajor) {
  console.error(`OPEN CLI requires Node.js ${minNodeMajor} or later. Found ${process.version}.`);
  process.exit(1);
}

// Detect JSON mode as early as possible (before any imports execute side effects)
const isJsonMode = process.argv.includes('--json');

// Silence all console output in JSON mode to ensure pure machine-readable output
if (isJsonMode) {
  const noop = () => {};
  console.log = noop;
  console.error = noop;
  console.warn = noop;
}

import { Command } from 'commander';
import { loadConfig } from '../src/config/loader';
import { registerTxCommand } from '../src/commands/tx';
import { registerBatchCommand } from '../src/commands/batch';
import { registerConfigCommand } from '../src/commands/config';
import { registerInfoCommand } from '../src/commands/info';
import { registerSimulateCommand } from '../src/commands/simulate';

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
  .name('opendev')
  .description('opendev — Visual transaction debugger and CU profiler for Solana')
  .version('0.3.0')
  .option('--verbose', 'Enable debug logging', false);

// 4. Register commands
registerTxCommand(program);
registerBatchCommand(program);
registerConfigCommand(program);
registerInfoCommand(program);
registerSimulateCommand(program);

// 5. Parse arguments
program.parse(process.argv);
