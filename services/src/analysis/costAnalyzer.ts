import { RawTransactionBundle, CUCost } from './types';
 
export interface TransferInfo {
  from: string;
  to: string;
  amount: string;
  token: string;
  decimals: number;
  uiAmount: number;
  usdValue: number | null;
  isSpamSuspect: boolean;
}
 
export interface CostAnalysis {
  transfers: TransferInfo[];
  cuCost: CUCost;
  totalTransferUSD: number | null;
}
 
const SAFE_MINTS = new Set([
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'So11111111111111111111111111111111111111112', // Wrapped SOL
]);
 
export function analyzeCosts(
  bundle: RawTransactionBundle,
  solPriceUSD: number | null,
  microLamportsPerCU: number
): CostAnalysis {
  const transfers: TransferInfo[] = [];
 
  // Analyze SPL token transfers
  if (bundle.postTokenBalances && bundle.postTokenBalances.length > 0) {
    const preMap = new Map<number, { amount: string; decimals: number }>();
    if (bundle.preTokenBalances) {
      for (const bal of bundle.preTokenBalances) {
        preMap.set(bal.accountIndex, {
          amount: bal.uiTokenAmount.amount,
          decimals: bal.uiTokenAmount.decimals,
        });
      }
    }
 
    for (const post of bundle.postTokenBalances) {
      const pre = preMap.get(post.accountIndex);
      const preAmount = pre ? pre.amount : '0';
      const postAmount = post.uiTokenAmount.amount;
      const decimals = post.uiTokenAmount.decimals;
 
      const preBigInt = BigInt(preAmount);
      const postBigInt = BigInt(postAmount);
      const delta = postBigInt - preBigInt;
 
      if (delta === BigInt(0)) {
        continue; // No change
      }
 
      const absAmount = delta < BigInt(0) ? delta * BigInt(-1) : delta;
      const uiAmount = Number(absAmount) / Math.pow(10, decimals);
 
      const isSpamSuspect = uiAmount > 1000000 && !SAFE_MINTS.has(post.mint);
 
      const transfer: TransferInfo = {
        from: delta < BigInt(0) ? bundle.accountKeys[post.accountIndex] : '',
        to: delta > BigInt(0) ? bundle.accountKeys[post.accountIndex] : '',
        amount: absAmount.toString(),
        token: post.mint,
        decimals,
        uiAmount,
        usdValue: null, // No price feed for SPL
        isSpamSuspect,
      };
 
      transfers.push(transfer);
    }
  }
 
  // Analyze SOL transfers
  if (bundle.preBalances && bundle.postBalances && bundle.preBalances.length > 0) {
    for (let i = 1; i < bundle.preBalances.length; i++) {
      // Skip index 0 (fee payer)
      const preBal = bundle.preBalances[i];
      const postBal = bundle.postBalances[i];
      const delta = postBal - preBal;
 
      // Only include meaningful deltas: delta > 0 (receiver) or delta < -5000 (sender, ignore fee noise)
      if (delta > 0 || delta < -5000) {
        const absAmount = Math.abs(delta);
        const uiAmount = absAmount / 1_000_000_000; // SOL has 9 decimals
 
        const usdValue = solPriceUSD !== null ? uiAmount * solPriceUSD : null;
 
        const transfer: TransferInfo = {
          from: delta < 0 ? bundle.accountKeys[i] : '',
          to: delta > 0 ? bundle.accountKeys[i] : '',
          amount: absAmount.toString(),
          token: 'SOL',
          decimals: 9,
          uiAmount,
          usdValue,
          isSpamSuspect: false,
        };
 
        transfers.push(transfer);
      }
    }
  }
 
  // Calculate CU cost
  const cuConsumed = bundle.computeUnitsConsumed ?? 0;
  const feeLamports = Math.floor((cuConsumed * microLamportsPerCU) / 1_000_000);
  const feeSOL = feeLamports / 1_000_000_000;
  const feeUSD = solPriceUSD !== null ? feeSOL * solPriceUSD : null;
 
  const cuCost: CUCost = {
    cuConsumed,
    microLamportsPerCU,
    feeLamports,
    feeSOL,
    feeUSD,
  };
 
  // Calculate total transfer USD
  let totalTransferUSD: number | null = null;
  const usdValues = transfers
    .map((t) => t.usdValue)
    .filter((v): v is number => v !== null);
  if (usdValues.length > 0) {
    totalTransferUSD = usdValues.reduce((sum, val) => sum + val, 0);
  }
 
  return {
    transfers,
    cuCost,
    totalTransferUSD,
  };
}