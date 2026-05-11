import dotenv from 'dotenv';
import path from 'path';
import { applyCredentialsToEnv } from './credentials';

// Resolve path to .env file relative to this source file, ensuring robustness for global installation.
const envPath = path.resolve(__dirname, '../../.env');

// Centralized configuration interface for application-wide use.
export interface AppConfig {
  rpcUrl?: string;
}

// Global configuration instance.
export let config: AppConfig = {};

/**
 * Initialize configuration. Called once at the top of bin/open.ts.
 *
 * Resolution order for AI keys (GROQ_API_KEY, ANTHROPIC_API_KEY):
 *   1. Already-set process.env (shell exports, CI secrets) — wins.
 *   2. .env file shipped with the install — legacy/dev path.
 *   3. ~/.opendev/credentials.json — what `opendev config set-key` writes.
 *
 * (1) and (2) merge here via dotenv (which doesn't overwrite existing env
 * vars). (3) fills in any gaps via applyCredentialsToEnv, which only sets
 * vars that are still missing.
 */
export const loadConfig = (): AppConfig => {
  dotenv.config({ path: envPath });
  applyCredentialsToEnv();

  config = {
    rpcUrl: process.env.OPEN_RPC_URL,
  };

  return config;
};
