// Centralized type definitions for CLI operations.
export interface CLIOptions {
  network: 'mainnet' | 'devnet'; // Strict typing prevents common user errors.
  json: boolean;                 // Output result as raw JSON.
  verbose: boolean;              // Global flag to enable debug logging.
}
    