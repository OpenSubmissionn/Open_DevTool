import type { AnalyzedTransaction, Insight, InsightReport } from './types';

/**
 * Interfaces to ensure type safety and professional structure
 */
interface RenderOutput {
  transaction: {
    signature: string;
    slot: number;
    timestamp: number | null;
    success: boolean;
    error: any;
  };
  computeUnits: {
    consumed: number;
    limit: number;
    utilization: number;
  };
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
 * Renders the analysis result and insights into a professional, 
 * structured JSON format suitable for CLI export or Frontend consumption.
 * * @param analyzed - The processed transaction data from the Engine
 * @param insights - Intelligence insights generated during analysis
 * @returns A strictly formatted and validated JSON string
 */
export function renderJSON(
  analyzed: AnalyzedTransaction,
  insights: InsightReport | Insight[] = []
): string {
  try {
    // Structural validation - ensures the core data exists
    if (!analyzed) {
      throw new Error("No analysis data provided to the renderer.");
    }

    const reportInsights: Insight[] = Array.isArray(insights)
      ? insights
      : ((insights as InsightReport)?.insights ?? []);

    const output: RenderOutput = {
      transaction: {
        signature: analyzed?.raw?.signature || analyzed?.parsed?.signature || (analyzed as any)?.signature || 'unknown',
        slot: analyzed?.raw?.slot || analyzed?.parsed?.slot || (analyzed as any)?.slot || 0,
        timestamp: analyzed?.raw?.blockTime ?? analyzed?.parsed?.blockTime ?? (analyzed as any)?.blockTime ?? null,
        success: analyzed?.parsed?.success ?? (analyzed?.raw ? !analyzed.raw.err : !(analyzed as any)?.error),
        error: analyzed?.raw?.err || (analyzed as any)?.error || null,
      },
      computeUnits: {
        consumed: analyzed?.cuProfile?.totalConsumed ?? (analyzed as any)?.computeUnits?.consumed ?? 0,
        limit: analyzed?.cuProfile?.totalLimit ?? (analyzed as any)?.computeUnits?.limit ?? 0,
        utilization: Number(((analyzed?.cuProfile?.utilizationPercent ?? (analyzed as any)?.computeUnits?.utilization ?? 0)).toFixed(4)),
      },
      accounts: analyzed?.accountDiffs || [],
      insights: reportInsights.map(insight => ({
        type: insight.type || 'GENERIC',
        level: insight.severity || 'info',
        message: insight.message || '',
        details: insight.context || {},
      })),
      metadata: {
        version: "1.0.0",
        generatedAt: new Date().toISOString(),
        engine: "OPEN-Insight-Engine-God-Mode" // Aquele toque de autoridade
      }
    };

    return JSON.stringify(output, null, 2);
  } catch (error) {
    // Professional error wrapping
    return JSON.stringify({
      error: "Render Error",
      message: error instanceof Error ? error.message : "Unknown error occurred during rendering",
      timestamp: new Date().toISOString()
    }, null, 2);
  }
}