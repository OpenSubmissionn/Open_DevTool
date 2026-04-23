import { Command } from 'commander';
import { config } from '../config/loader'; // Accessing loaded configuration.

export const registerConfigCommand = (program: Command) => {
  // Create 'config' command group.
  const configCommand = program
    .command('config')
    .description('Manage OPEN CLI configuration');

  // Register 'set' subcommand within 'config'.
  configCommand
    .command('set')
    .description('Update a configuration value')
    // Task requirement: 'open config set rpc <url>'
    .command('rpc') 
    .argument('<url>', 'The Solana RPC URL to use')
    .description('Set the default Solana RPC URL')
    .action((url: string) => {
      // Future expansion: Add URL format validation.

      // Action Stub (Task 1.1.3 requirement).
      console.log(`--- Config Set RPC (Stub) ---`);
      console.log(`URL Received: ${url}`);
      console.log(`Current loaded RPC (from .env): ${config.rpcUrl}`);
      console.log(
        '\nStatus: Saving to ~/.open/config.json is NOT IMPLEMENTED YET.'
      );
    });
};

