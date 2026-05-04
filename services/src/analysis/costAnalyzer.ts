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
  //
  // The previous version emitted one TransferInfo per balance delta, leaving
  // either `from` or `to` empty — the UI rendered "—" on the other side.
  // We now pair outgoing and incoming deltas of the same magnitude so both
  // ends of a transfer are visible. Unpaired deltas (mints/burns, escrow
  // close, rent reclaim) still surface with "—" because they genuinely have
  // no counterparty.
  //
  // Pairing tolerance covers the fee payer case: the sender's outgoing delta
  // equals (transferred + tx fee), so we allow a small absolute slack.
  if (bundle.preBalances && bundle.postBalances && bundle.preBalances.length > 0) {
    type Delta = { pubkey: string; amount: number; idx: number };
    const outflows: Delta[] = [];
    const inflows: Delta[] = [];

    for (let i = 0; i < bundle.preBalances.length; i++) {
      const delta = bundle.postBalances[i] - bundle.preBalances[i];
      // Skip noise below typical tx fee.
      if (delta > 0) inflows.push({ pubkey: bundle.accountKeys[i], amount: delta, idx: i });
      else if (delta < -5000)
        outflows.push({ pubkey: bundle.accountKeys[i], amount: -delta, idx: i });
    }

    // Process largest first so big transfers get matched before dust rebates.
    outflows.sort((a, b) => b.amount - a.amount);
    inflows.sort((a, b) => b.amount - a.amount);

    const FEE_SLACK_LAMPORTS = 10_000; // covers signature fee + small priority fees
    const consumedInflows = new Set<number>();

    for (const out of outflows) {
      // Best inflow: same amount (exact), or amount = out - fee (sender pays fee).
      let matchIdx = -1;
      for (let k = 0; k < inflows.length; k++) {
        if (consumedInflows.has(k)) continue;
        const diff = out.amount - inflows[k].amount;
        if (diff >= 0 && diff <= FEE_SLACK_LAMPORTS) {
          matchIdx = k;
          break;
        }
      }

      const uiAmount = out.amount / 1_000_000_000;
      const usdValue = solPriceUSD !== null ? uiAmount * solPriceUSD : null;

      if (matchIdx >= 0) {
        const inflow = inflows[matchIdx];
        consumedInflows.add(matchIdx);
        transfers.push({
          from: out.pubkey,
          to: inflow.pubkey,
          amount: inflow.amount.toString(),
          token: 'SOL',
          decimals: 9,
          uiAmount: inflow.amount / 1_000_000_000,
          usdValue: solPriceUSD !== null ? (inflow.amount / 1_000_000_000) * solPriceUSD : null,
          isSpamSuspect: false,
        });
      } else {
        transfers.push({
          from: out.pubkey,
          to: '',
          amount: out.amount.toString(),
          token: 'SOL',
          decimals: 9,
          uiAmount,
          usdValue,
          isSpamSuspect: false,
        });
      }
    }

    // Inflows with no matching outflow (mint, rent reclaim, program payout).
    for (let k = 0; k < inflows.length; k++) {
      if (consumedInflows.has(k)) continue;
      const inflow = inflows[k];
      const uiAmount = inflow.amount / 1_000_000_000;
      transfers.push({
        from: '',
        to: inflow.pubkey,
        amount: inflow.amount.toString(),
        token: 'SOL',
        decimals: 9,
        uiAmount,
        usdValue: solPriceUSD !== null ? uiAmount * solPriceUSD : null,
        isSpamSuspect: false,
      });
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
