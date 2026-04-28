import type { AnalyzedTransaction, Insight, InsightReport } from './types';
 
/**
 * Output payload shape for JSON rendering.
 */
interface RenderOutput {
  transaction: {
    signature: string;
    slot: number;
    timestamp: number | null;
    timestampISO: string | null;
    fee: number;
    feeLamports: number;
    feeSOL: number;
    success: boolean;
    error: any;
  };
  computeUnits: {
    consumed: number;
    limit: number;
    utilization: number;
  };
  cuCost: {
    cuConsumed: number;
    microLamportsPerCU: number;
    feeLamports: number;
    feeSOL: number;
    feeUSD: number | null;
  } | null;
  transfers: Array<{
    from: string;
    to: string;
    amount: string;
    token: string;
    decimals: number;
    uiAmount: number;
    usdValue: number | null;
    isSpamSuspect: boolean;
  }>;
  accounts: any[];
  insights: Array<{
    type: string;
    level: string;
    message: string;
    details: any;
  }>;
  metadata: {
    version: string;
    generatedAt: string;
    engine: string;
  };
}
 
/**
 * Build CLI JSON output from analyzed transaction data and insights.
 * @param analyzed Processed transaction analysis result.
 * @param insights Insight report or raw insight list.
 * @returns Pretty-printed JSON string.
 */
export function renderJSON(
  analyzed: AnalyzedTransaction,
  insights: InsightReport | Insight[] = []
): string {
  try {
    // Guard against invalid input.
    if (!analyzed) {
      throw new Error("No analysis data provided to the renderer.");
    }
 
    const reportInsights: Insight[] = Array.isArray(insights)
      ? insights
      : ((insights as InsightReport)?.insights ?? []);
 
    // Prefer canonical CU from RPC meta; fallback to profiler totals.
    const fallbackConsumed = analyzed?.cuProfile?.totalConsumed ?? (analyzed as any)?.computeUnits?.consumed ?? 0;
    const consumed = analyzed?.raw?.computeUnitsConsumed ?? fallbackConsumed;
    const limit = analyzed?.cuProfile?.totalLimit ?? (analyzed as any)?.computeUnits?.limit ?? 0;
    const fallbackUtilization = analyzed?.cuProfile?.utilizationPercent ?? (analyzed as any)?.computeUnits?.utilization ?? 0;
    const utilization = analyzed?.raw?.computeUnitsConsumed != null && limit > 0
      ? (consumed / limit) * 100
      : fallbackUtilization;
 
    const timestamp = analyzed?.raw?.blockTime ?? analyzed?.parsed?.blockTime ?? (analyzed as any)?.blockTime ?? null;
    const timestampISO = typeof timestamp === 'number' ? new Date(timestamp * 1000).toISOString() : null;
 
    const feeLamports = analyzed?.parsed?.fee ?? (analyzed as any)?.fee ?? 0;
 
    const cuCost = analyzed?.cuCost ?? null;
    const transfers = analyzed?.transfers ?? [];
 
    const output: RenderOutput = {
      transaction: {
        signature: analyzed?.raw?.signature || analyzed?.parsed?.signature || (analyzed as any)?.signature || 'unknown',
        slot: analyzed?.raw?.slot || analyzed?.parsed?.slot || (analyzed as any)?.slot || 0,
        timestamp,
        timestampISO,
        fee: feeLamports,
        feeLamports,
        feeSOL: feeLamports / 1_000_000_000,
        success: analyzed?.parsed?.success ?? (analyzed?.raw ? !analyzed.raw.err : !(analyzed as any)?.error),
        error: analyzed?.raw?.err || (analyzed as any)?.error || null,
      },
      computeUnits: {
        consumed,
        limit,
        utilization: Number(utilization.toFixed(4)),
      },
      cuCost: cuCost
        ? {
            cuConsumed: cuCost.cuConsumed,
            microLamportsPerCU: cuCost.microLamportsPerCU,
            feeLamports: cuCost.feeLamports,
            feeSOL: cuCost.feeSOL,
            feeUSD: cuCost.feeUSD,
          }
        : null,
      transfers: transfers.map((t) => ({
        from: t.from,
        to: t.to,
        amount: t.amount,
        token: t.token,
        decimals: t.decimals,
        uiAmount: t.uiAmount,
        usdValue: t.usdValue,
        isSpamSuspect: t.isSpamSuspect,
      })),
      accounts: (analyzed?.accountDiffs || []).map((account) => {
        const { solDelta, ...accountWithoutLegacyDelta } = account;
        return {
          ...accountWithoutLegacyDelta,
          solDeltaLamports: solDelta,
          solDeltaSOL: solDelta / 1_000_000_000,
        };
      }),
      insights: reportInsights.map(insight => ({
        type: insight.type || 'GENERIC',
        level: insight.severity || 'info',
        message: insight.message || '',
        details: insight.context || {},
      })),
      metadata: {
        version: "1.0.0",
        generatedAt: new Date().toISOString(),
        engine: "OPEN-Insight-Engine-God-Mode"
      }
    };
 
    return JSON.stringify(output, null, 2);
  } catch (error) {
    // Return machine-readable render errors.
    return JSON.stringify({
      error: "Render Error",
      message: error instanceof Error ? error.message : "Unknown error occurred during rendering",
      timestamp: new Date().toISOString()
    }, null, 2);
  }
}
