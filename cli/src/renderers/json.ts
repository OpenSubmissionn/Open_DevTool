import { AnalyzedTransaction, InsightReport } from '@open/services';

/**
 * Converts transaction analysis and insights into a formatted JSON string.
 * Structured for machine validation (Task 3.6.4).
 */
export function renderJSON(analyzed: AnalyzedTransaction, insights: InsightReport): string {
  const output: any = {
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
    anomalies: analyzed.anomalies?.anomalies ?? [],
    anomalySummary: analyzed.anomalies?.summary ?? 'No anomalies detected',
  };
  // Always merge timings into metadata, using only _metadata fields
  const metadata: Record<string, any> = {};
  if (analyzed._metadata && Array.isArray(analyzed._metadata.timings)) {
    metadata.timings = analyzed._metadata.timings;
  }
  // Merge any other _metadata fields (except timings)
  if (analyzed._metadata) {
    for (const [k, v] of Object.entries(analyzed._metadata)) {
      if (k !== 'timings') metadata[k] = v;
    }
  }
  if (analyzed._metadata?.timings?.length) {
    output._metadata = {
      timings: analyzed._metadata.timings,
    };
  }
  return JSON.stringify(output, null, 2);
}
