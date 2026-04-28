import { AnalyzedTransaction, InsightReport } from '@open/services';

/**
 * Converts transaction analysis and insights into a formatted JSON string.
 * Structured for machine validation (Task 3.6.4).
 */
export function renderJSON(analyzed: AnalyzedTransaction, insights: InsightReport): string {
  const output = {
    transaction: {
      signature: analyzed.signature,
      success: analyzed.success,
      timestamp: new Date().toISOString(),
    },

    computeUnits: {
      consumed: analyzed.cuProfile?.totalConsumed ?? 0,
      utilization: analyzed.cuProfile?.utilizationPercent ?? 0,
    },

    // Keep stable shape even when no transfers exist
    transfers: [],

    accounts: analyzed.accountDiffs ?? [],

    // Expose CPI tree in a simple consumable format
    programs: analyzed.cpiTree?.root ?? [],

    insights: insights.insights ?? [],

    metadata: {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
    }
  };

  return JSON.stringify(output, null, 2);
}