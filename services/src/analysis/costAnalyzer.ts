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
  // Approach: pair outgoing and incoming balance deltas so both ends of each
  // transfer surface in the UI. Two refinements over a naïve implementation:
  //
  // 1) Fee-payer adjustment. In Solana, accountKeys[0] is the fee payer and
  //    is the only account charged the tx fee. Their on-chain delta is
  //    `-(transferred + fee)`, which previously broke pairing for high-priority
  //    txs (Pump.fun, Jupiter — where the fee can be hundreds of thousands of
  //    lamports). We now add `feeLamports` back to that account's delta so the
  //    pairing logic operates on pure transfer amounts. Fee accounting still
  //    happens in the cuCost panel; nothing is lost, just separated.
  //
  // 2) Exact pairing tolerance. After fee adjustment, sender and receiver
  //    deltas of the same transfer should match exactly — no slack needed.
  //
  // Known limitation (single-account net delta):
  //   `preBalances`/`postBalances` give only NET change per account. If the
  //   same account both sends and receives SOL within one tx (e.g. swap pool
  //   that nets to a small fee), only the net flow is visible — gross legs
  //   are invisible without parsing each instruction. This affects neither
  //   the fee math nor the spam detector; it's purely a transfer-table
  //   completeness gap. To fix, we would need to walk the parsed instructions
  //   and aggregate System.transfer calls — out of scope for the current pass.
  if (bundle.preBalances && bundle.postBalances && bundle.preBalances.length > 0) {
    type Delta = { pubkey: string; amount: number; idx: number };
    const outflows: Delta[] = [];
    const inflows: Delta[] = [];

    const txFee = bundle.fee ?? 0;

    for (let i = 0; i < bundle.preBalances.length; i++) {
      let delta = bundle.postBalances[i] - bundle.preBalances[i];

      // Fee payer (accountKeys[0]): net out the tx fee so the remaining delta
      // reflects only their transfer activity. Result is 0 when they only paid
      // the fee, which is correctly skipped by the `delta !== 0` filter below.
      if (i === 0) delta += txFee;

      if (delta > 0) inflows.push({ pubkey: bundle.accountKeys[i], amount: delta, idx: i });
      else if (delta < 0) outflows.push({ pubkey: bundle.accountKeys[i], amount: -delta, idx: i });
    }

    // Process largest first so big transfers get matched before dust rebates.
    outflows.sort((a, b) => b.amount - a.amount);
    inflows.sort((a, b) => b.amount - a.amount);

    const consumedInflows = new Set<number>();

    for (const out of outflows) {
      // After fee adjustment, exact match is the norm. Allow 1 lamport for any
      // floor-rounding artifacts in derivatives like rent reclaim refunds.
      let matchIdx = -1;
      for (let k = 0; k < inflows.length; k++) {
        if (consumedInflows.has(k)) continue;
        if (Math.abs(out.amount - inflows[k].amount) <= 1) {
          matchIdx = k;
          break;
        }
      }

      if (matchIdx >= 0) {
        const inflow = inflows[matchIdx];
        consumedInflows.add(matchIdx);
        const uiAmount = inflow.amount / 1_000_000_000;
        transfers.push({
          from: out.pubkey,
          to: inflow.pubkey,
          amount: inflow.amount.toString(),
          token: 'SOL',
          decimals: 9,
          uiAmount,
          usdValue: solPriceUSD !== null ? uiAmount * solPriceUSD : null,
          isSpamSuspect: false,
        });
      } else {
        const uiAmount = out.amount / 1_000_000_000;
        transfers.push({
          from: out.pubkey,
          to: '',
          amount: out.amount.toString(),
          token: 'SOL',
          decimals: 9,
          uiAmount,
          usdValue: solPriceUSD !== null ? uiAmount * solPriceUSD : null,
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
  //
  // Source of truth:
  //   - cuConsumed: bundle.computeUnitsConsumed (canonical RPC meta value, what
  //     Solscan and validators report). The summed-from-logs value in cuProfile
  //     can lag by hundreds of CU because Compute Budget invocations and other
  //     implicit costs don't always emit `consumed N of M` log lines.
  //   - feeLamports: bundle.fee (authoritative total fee from RPC meta.fee,
  //     which already equals base + priority). Recomputing only the priority
  //     component here was the source of the "275 lamports" mismatch with the
  //     header fee.
  //
  // Strategy:
  //   - feeLamports is canonical (from RPC meta.fee).
  //   - baseFeeLamports = 5000 × numRequiredSignatures (Solana protocol rule).
  //   - priorityFeeLamports = feeLamports - baseFeeLamports (whatever's left).
  //   - microLamportsPerCU is for DISPLAY ("Price: X µL/CU"). Prefer the value
  //     decoded from the SetComputeUnitPrice instruction; if unavailable
  //     (versioned txs where the RPC doesn't pre-parse), back-derive it from
  //     the actual priority fee paid.
  //
  // Always preserves the identity baseFee + priorityFee = totalFee.
  const cuConsumed = bundle.computeUnitsConsumed ?? 0;
  const feeLamports = bundle.fee ?? 0;

  const numSigs =
    (bundle.rawResponse?.transaction as any)?.message?.header?.numRequiredSignatures ?? 1;
  const baseFeeLamports = Math.min(feeLamports, 5_000 * numSigs);
  const priorityFeeLamports = feeLamports - baseFeeLamports;

  // Display price: prefer instruction-decoded value, fall back to back-derivation.
  const effectiveMicroLamportsPerCU =
    microLamportsPerCU > 0
      ? microLamportsPerCU
      : cuConsumed > 0
        ? Math.round((priorityFeeLamports * 1_000_000) / cuConsumed)
        : 0;

  const feeSOL = feeLamports / 1_000_000_000;
  const feeUSD = solPriceUSD !== null ? feeSOL * solPriceUSD : null;

  const cuCost: CUCost = {
    cuConsumed,
    microLamportsPerCU: effectiveMicroLamportsPerCU,
    feeLamports,
    feeSOL,
    feeUSD,
    priorityFeeLamports,
    baseFeeLamports,
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
 * Calculate CU cost from raw data.
 *
 * Used as a fallback when only CU + price are known (no full bundle). Pass
 * `totalFeeLamports` from `bundle.fee` (RPC meta.fee) when available so that
 * `feeLamports` reflects the true total. If omitted, the function assumes the
 * priority fee plus a single signature base fee (5000 lamports) — this matches
 * the most common case but is a heuristic, not the canonical value.
 */
export async function calculateCUCostFromCU(
  cuConsumed: number,
  microLamportsPerCU: number,
  solPriceUSD: number | null,
  totalFeeLamports?: number
): Promise<CUCost> {
  const priorityFeeLamports = Math.floor((cuConsumed * microLamportsPerCU) / 1_000_000);
  const feeLamports = totalFeeLamports ?? priorityFeeLamports + 5000;
  const baseFeeLamports = Math.max(0, feeLamports - priorityFeeLamports);
  const feeSOL = feeLamports / 1_000_000_000;
  const feeUSD = solPriceUSD !== null ? feeSOL * solPriceUSD : null;

  return {
    cuConsumed,
    microLamportsPerCU,
    feeLamports,
    feeSOL,
    feeUSD,
    priorityFeeLamports,
    baseFeeLamports,
  };
}
