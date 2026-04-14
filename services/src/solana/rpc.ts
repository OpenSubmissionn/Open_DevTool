import { ParsedTransactionWithMeta } from '@solana/web3.js';
import { getConnection, withRetry } from './connection';


export interface RawTransactionBundle {
  signature: string;
  slot: number;
  blockTime: number | null | undefined;
  logs: string[] | null;
  computeUnitsConsumed: number | undefined;
  preBalances: number[];
  postBalances: number[];
  preTokenBalances: any[] | null | undefined;
  postTokenBalances: any[] | null | undefined;
  innerInstructions: any[] | null | undefined;
  accountKeys: any[];
  rawResponse: ParsedTransactionWithMeta;
}


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
    logs: tx.meta?.logMessages || [],
    computeUnitsConsumed: tx.meta?.computeUnitsConsumed,
    preBalances: tx.meta?.preBalances || [],
    postBalances: tx.meta?.postBalances || [],
    preTokenBalances: tx.meta?.preTokenBalances,
    postTokenBalances: tx.meta?.postTokenBalances,
    innerInstructions: tx.meta?.innerInstructions,
    accountKeys: tx.transaction.message.accountKeys,
    rawResponse: tx,
  };
};
