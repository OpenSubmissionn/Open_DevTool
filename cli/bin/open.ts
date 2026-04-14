#!/usr/bin/env node

// Essential Shebang line to notify the OS to use node.
// Located in bin/ following Node.js executable standards.

import { Command } from 'commander';
import { loadConfig } from '../src/config/loader';
import { registerTxCommand } from '../src/commands/tx';
import { registerConfigCommand } from '../src/commands/config';

// 1. Initialize configuration (dotenv). Must occur early.
loadConfig();

// 2. Initialize Commander program.
const program = new Command();

// 3. Configure basic tool metadata.
program
  .name('open')
  .description('OPEN - Solana Observability and CU Analysis CLI')
  .version('0.1.0') // Future extension: Consider importing version from package.json
  // Define global options (verbose logging).
  .option('--verbose', 'Enable debug logging', false);

// 4. Register command modules.
// This separation keeps open.ts clean and extensible.
registerTxCommand(program);
registerConfigCommand(program);

// 5. Parse command-line arguments and execute matching actions.
// Commander automatically handles --help and unknown commands.
program.parse(process.argv);
