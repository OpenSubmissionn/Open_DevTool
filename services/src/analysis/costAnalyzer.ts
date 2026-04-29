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

interface MintAggregate {
  sender?: string;
  receiver?: string;
  uiAmount: number;
  decimals: number;
  isSpamSuspect: boolean;
}

export function analyzeCosts(
  bundle: RawTransactionBundle,
  solPriceUSD: number | null,
  microLamportsPerCU: number
): CostAnalysis {
  const transfers: TransferInfo[] = [];

  // Analyze SPL token transfers — grouped by mint to get correct from/to
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

    const byMint = new Map<string, MintAggregate>();

    for (const post of bundle.postTokenBalances) {
      const pre = preMap.get(post.accountIndex);
      const preAmt = BigInt(pre?.amount ?? '0');
      const postAmt = BigInt(post.uiTokenAmount.amount);
      const delta = postAmt - preAmt;

      if (delta === 0n) continue;

      const decimals = post.uiTokenAmount.decimals;
      const uiAmount = Number(delta < 0n ? -delta : delta) / Math.pow(10, decimals);
      const isSpamSuspect = uiAmount > 1_000_000 && !SAFE_MINTS.has(post.mint);

      const entry: MintAggregate = byMint.get(post.mint) ?? { uiAmount, decimals, isSpamSuspect };

      if (delta < 0n) entry.sender = bundle.accountKeys[post.accountIndex];
      else entry.receiver = bundle.accountKeys[post.accountIndex];

      byMint.set(post.mint, entry);
    }

    for (const [mint, entry] of byMint) {
      transfers.push({
        from: entry.sender ?? '',
        to: entry.receiver ?? '',
        token: mint,
        decimals: entry.decimals,
        uiAmount: entry.uiAmount,
        amount: (entry.uiAmount * Math.pow(10, entry.decimals)).toFixed(0),
        usdValue: null, // No price feed for SPL
        isSpamSuspect: entry.isSpamSuspect,
      });
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
        const uiAmount = absAmount / 1_000_000_000;

        const usdValue = solPriceUSD !== null ? uiAmount * solPriceUSD : null;

        transfers.push({
          from: delta < 0 ? bundle.accountKeys[i] : '',
          to: delta > 0 ? bundle.accountKeys[i] : '',
          amount: absAmount.toString(),
          token: 'SOL',
          decimals: 9,
          uiAmount,
          usdValue,
          isSpamSuspect: false,
        });
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
  const usdValues = transfers.map((t) => t.usdValue).filter((v): v is number => v !== null);
  if (usdValues.length > 0) {
    totalTransferUSD = usdValues.reduce((sum, val) => sum + val, 0);
  }

  return {
    transfers,
    cuCost,
    totalTransferUSD,
  };
}

/**
 * Calculate CU cost from raw data
 * Used by merger to add cost info to analysis
 */
export async function calculateCUCostFromCU(
  cuConsumed: number,
  microLamportsPerCU: number,
  solPriceUSD: number | null
): Promise<CUCost> {
  const feeLamports = Math.floor((cuConsumed * microLamportsPerCU) / 1_000_000);
  const feeSOL = feeLamports / 1_000_000_000;
  const feeUSD = solPriceUSD !== null ? feeSOL * solPriceUSD : null;

  return { cuConsumed, microLamportsPerCU, feeLamports, feeSOL, feeUSD };
}
