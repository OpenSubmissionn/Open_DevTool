import { Connection, ConnectionConfig } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

// URLs de conexão
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL;
const DEVNET_RPC_URL = 'https://api.devnet.solana.com';
const MAINNET_RPC_URL = 'https://api.mainnet-beta.solana.com';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF = 1000;

/**
 * Retorna uma instância de conexão com a Solana.
 * Prioridade: 1. URL customizada | 2. Helius RPC | 3. Public RPC (Fallback )
 */
export const getConnection = (
  rpcUrl?: string,
  network: 'mainnet' | 'devnet' = 'devnet'
): Connection => {
  // Aqui está a lógica de fallback que faltava
  const url =
    rpcUrl || HELIUS_RPC_URL || (network === 'mainnet' ? MAINNET_RPC_URL : DEVNET_RPC_URL);

  const config: ConnectionConfig = {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  };

  console.log(
    `Connecting to Solana via: ${url === HELIUS_RPC_URL ? 'Helius' : network === 'mainnet' ? 'Mainnet' : 'Devnet'} RPC`
  );
  return new Connection(url, config);
};

/**
 * Executa uma função com lógica de retry e backoff exponencial.
 */
export const withRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  let lastError: any;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const backoff = INITIAL_BACKOFF * Math.pow(2, attempt);
      console.warn(`Attempt ${attempt + 1} failed. Retrying in ${backoff}ms...`);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  throw lastError;
};
