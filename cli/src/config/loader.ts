import dotenv from 'dotenv';
import path from 'path';

// Resolve path to .env file relative to this source file, ensuring robustness for global installation.
const envPath = path.resolve(__dirname, '../../.env');

// Centralized configuration interface for application-wide use.
export interface AppConfig {
  rpcUrl?: string;
}

// Global configuration instance.
export let config: AppConfig = {};

// Initialize configuration. Should be called early in the CLI lifecycle.
export const loadConfig = (): AppConfig => {
  // Load variables from .env file into process.env.
  const result = dotenv.config({ path: envPath });

  // Handle errors, such as missing .env file.
  if (result.error) {
    // Production tooling would use verbose/debug flags for logging.
    // console.error(`[config] Warning: Could not load .env file from ${envPath}`);
  }

  // Map process.env values to the typed AppConfig interface.
  config = {
    rpcUrl: process.env.OPEN_RPC_URL,
    // Future expansion:
    // configPath: process.env.OPEN_CONFIG_PATH || path.join(os.homedir(), '.open', 'config.json')
  };

  // Temporary log for task validation.
  console.log('[config] Scaffolding: Loaded configuration from .env stub.');

  return config;
};