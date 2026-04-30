import { AnalyzedTransaction, InsightReport } from '@open/services';

/**
 * Converts transaction analysis and insights into a formatted JSON string.
 * Structured for machine validation (Task 3.6.4).
 */
export function renderJSON(analyzed: AnalyzedTransaction, insights: InsightReport): string {
  const output = {
    signature: analyzed.signature,
    status: analyzed.success ? 'success' : 'failed',
    timestamp: new Date().toISOString(),
    statistics: {
      totalComputeUnits: analyzed.cuProfile.totalConsumed,
      computeUtilization: `${analyzed.cuProfile.utilizationPercent}%`,
      cpiDepth: analyzed.cpiTree.totalDepth,
      accountChanges: analyzed.accountDiffs.length,
    },
    analysis: {
      computeUnits: analyzed.cuProfile,
      cpiTree: analyzed.cpiTree,
      accountDiffs: analyzed.accountDiffs,
    },
    insights: insights.insights,
    primaryBottleneck: insights.primaryBottleneck,
  };

  return JSON.stringify(output, null, 2);
}
