import { ParsedTransactionWithMeta } from '@solana/web3.js';
import { getConnection, withRetry } from './connection';
import { RawTransactionBundle } from '../analysis/types';


export const fetchTransaction = async (signature: string): Promise<RawTransactionBundle> => {
  const connection = getConnection();

  const tx = await withRetry(() =>
    connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    })
  );

  if (!tx) {
    throw new Error(`Transaction not found: ${signature}`);
  }

  return {
    signature,
    slot: tx.slot,
    blockTime: tx.blockTime,
    transaction: tx.transaction,
    logMessages: tx.meta?.logMessages || [],
    computeUnitsConsumed: tx.meta?.computeUnitsConsumed || null,
    preBalances: tx.meta?.preBalances || [],
    postBalances: tx.meta?.postBalances || [],
    preTokenBalances: tx.meta?.preTokenBalances || [],
    postTokenBalances: tx.meta?.postTokenBalances || [],
    innerInstructions: tx.meta?.innerInstructions || [],
    err: tx.meta?.err || null,
    accountKeys: tx.transaction.message.accountKeys,
    rawResponse: tx,
  };
};
