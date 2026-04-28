import {
  AnalyzedTransaction,
  Insight,
  InsightReport,
  InsightContext,
  ProviderInsight,
} from './types';

export interface InsightProvider {
  fetchInsights(context: InsightContext): Promise<ProviderInsight[]>;
}

const getCanonicalConsumed = (tx: AnalyzedTransaction): number =>
  tx.raw?.computeUnitsConsumed ?? tx.cuProfile.totalConsumed;

const getCanonicalUtilizationPercent = (tx: AnalyzedTransaction): number => {
  if (tx.cuProfile.totalLimit <= 0) {
    return tx.cuProfile.utilizationPercent;
  }
  return (getCanonicalConsumed(tx) / tx.cuProfile.totalLimit) * 100;
};

/**
 * TASK 1.6.1 - INSIGHT ENGINE (GOD MODE)
 * Core diagnostic system that transforms raw execution data into actionable intelligence.
 */

// --- DIAGNOSTIC RULES ---

/**
 * Detects if the transaction failed.
 */
const checkFailure = (tx: AnalyzedTransaction): Insight | null => {
  if (tx.parsed.success) return null;
  return {
    type: 'EXECUTION_FAILURE',
    severity: 'critical',
    title: 'Critical Execution Failure',
    message: 'The transaction failed, reverting all state changes and interrupting execution flow.',
    recommendation: 'Verify account balances and ensure program constraints/guards are satisfied.',
    tags: ['failure'],
    source: 'rule',
    codeSuggestions: [],
  };
};

/**
 * Identifies programs consuming a disproportionate amount of compute units.
 */
const checkCUBottleneck = (tx: AnalyzedTransaction): Insight | null => {
  const bottleneck = tx.cuProfile.bottleneck;
  if (!bottleneck || bottleneck.utilizationPercent < 40) return null;

  return {
    type: 'CU_BOTTLENECK',
    severity: bottleneck.utilizationPercent > 70 ? 'critical' : 'warning',
    title: `Performance Bottleneck: ${bottleneck.programName}`,
    message: `${bottleneck.programName} consumed ${bottleneck.cuConsumed.toLocaleString()} CUs (${bottleneck.utilizationPercent}% of total).`,
    recommendation: 'Optimize internal loops or simplify account state to reduce compute pressure.',
    tags: ['performance'],
    programId: bottleneck.programId,
    context: { programId: bottleneck.programId },
    source: 'rule',
    codeSuggestions: [],
  };
};

/**
 * Detects overallocation of compute units to optimize fees.
 */
const checkCUWaste = (tx: AnalyzedTransaction): Insight | null => {
  const consumed = getCanonicalConsumed(tx);
  const wasted = tx.cuProfile.totalLimit - consumed;
  const wastePercent = (wasted / tx.cuProfile.totalLimit) * 100;

  if (wastePercent < 50 || tx.cuProfile.totalLimit <= 200000) return null;

  const suggestedLimit = Math.ceil(consumed * 1.1);

  return {
    type: 'CU_WASTE',
    severity: 'info',
    title: 'Compute Unit Over-allocation',
    message: `Transaction requested high limits but only used ${consumed.toLocaleString()} CUs (${wastePercent.toFixed(1)}% waste).`,
    recommendation: `Set Compute Budget to ~${suggestedLimit.toLocaleString()} CUs to lower fees and improve priority.`,
    tags: ['cost', 'optimization'],
    estimatedCUSavings: wasted,
    source: 'rule',
    codeSuggestions: [],
  };
};

/**
 * Budget Exceeded Risk (>90% utilization)
 */
const checkBudgetRisk = (tx: AnalyzedTransaction): Insight | null => {
  const utilizationPercent = getCanonicalUtilizationPercent(tx);
  if (utilizationPercent < 85) return null;

  return {
    type: 'BUDGET_RISK',
    severity: 'warning',
    title: 'Near Compute Budget Limit',
    message: `Transaction used ${utilizationPercent.toFixed(1)}% of its CU limit, risking random failures.`,
    recommendation:
      'Slightly increase the compute budget limit or optimize high-cost instructions.',
    tags: ['performance', 'risk'],
    source: 'rule',
    codeSuggestions: [],
  };
};

/**
 * Deep CPI (Depth > 3)
 */
const checkDeepCPI = (tx: AnalyzedTransaction): Insight | null => {
  if (tx.cpiTree.totalDepth <= 4) return null;

  return {
    type: 'DEEP_CPI',
    severity: 'info',
    title: 'High Execution Complexity',
    message: `Transaction has a CPI depth of ${tx.cpiTree.totalDepth}, indicating many nested program calls.`,
    recommendation:
      'Deeply nested calls increase execution risk and gas costs. Consider flattening the logic.',
    tags: ['complexity'],
    source: 'rule',
    codeSuggestions: [],
  };
};

/**
 * Warns when CU-by-node attribution confidence is low.
 */
const checkCUAttributionQuality = (tx: AnalyzedTransaction): Insight | null => {
  const attribution = tx.parsed.cuAttribution;
  if (!attribution) return null;

  if (attribution.confidence >= 0.7 && attribution.doubleAttributionCount === 0) {
    return null;
  }

  const severity: Insight['severity'] = attribution.confidence < 0.5 ? 'warning' : 'info';
  const confidencePercent = (attribution.confidence * 100).toFixed(1);

  return {
    type: 'CU_ATTRIBUTION_LOW_CONFIDENCE',
    severity,
    title: 'CU Attribution Has Reduced Confidence',
    message: `CU by node attribution confidence is ${confidencePercent}% with ${attribution.unmatchedCUEntries} unmatched CU entries.`,
    recommendation:
      'Review CPI/inner-instruction alignment and ensure complete logs for precise per-node attribution.',
    tags: ['quality', 'diagnostics'],
    context: {
      confidence: attribution.confidence,
      unmatchedCUEntries: attribution.unmatchedCUEntries,
      ambiguousKeys: attribution.ambiguousKeys,
      doubleAttributionCount: attribution.doubleAttributionCount,
      traceTruncated: attribution.traceTruncated,
    },
    source: 'rule',
    codeSuggestions: [],
  };
};

// --- CORE ENGINE ---
/* Merges insights from multiple providers, tagging sources and deduplicating. */
export function mergeInsights(ruleInsights: Insight[], mcpInsights: ProviderInsight[]): Insight[] {
  const allInsights: Insight[] = [];

  // Add rule insights
  allInsights.push(...ruleInsights);

  // Add MCP insights
  allInsights.push(...mcpInsights.map((pi) => pi.insight));

  // Create a map to track insights by type for hybrid detection
  const insightMap = new Map<string, Insight[]>();

  for (const insight of allInsights) {
    const key = insight.type;
    if (!insightMap.has(key)) {
      insightMap.set(key, []);
    }
    insightMap.get(key)!.push(insight);
  }

  // Process each group
  const merged: Insight[] = [];
  for (const [type, insights] of insightMap) {
    if (insights.length === 1) {
      // Only one source, keep as is
      merged.push(insights[0]);
    } else {
      // Multiple sources, check if they agree
      const ruleInsight = insights.find((i) => i.source === 'rule');
      const mcpInsight = insights.find((i) => i.source === 'mcp');

      if (ruleInsight && mcpInsight) {
        // Both sources agree on the same issue type
        merged.push({
          ...ruleInsight,
          source: 'hybrid',
          codeSuggestions: mcpInsight.codeSuggestions || [],
        });
      } else {
        // Different sources, keep both
        merged.push(...insights);
      }
    }
  }

  return merged;
}

/**
 * Orchestrates all diagnostic rules and providers, merging insights with source tagging.
 */
export const analyzeTransaction = async (
  tx: AnalyzedTransaction,
  provider?: InsightProvider
): Promise<InsightReport> => {
  const rules = [
    checkFailure,
    checkCUAttributionQuality,
    checkCUBottleneck,
    checkCUWaste,
    checkBudgetRisk,
    checkDeepCPI,
  ];

  const ruleInsights = rules.map((rule) => rule(tx)).filter((i): i is Insight => i !== null);

  let providerInsights: ProviderInsight[] = [];
  if (provider) {
    try {
      const context: InsightContext = { transaction: tx };
      providerInsights = await provider.fetchInsights(context);
    } catch (error) {
      console.warn('Insight provider failed, falling back to rule-based insights only:', error);
    }
  }

  const mergedInsights = mergeInsights(ruleInsights, providerInsights);

  const severityScore = { critical: 0, warning: 1, info: 2 };
  mergedInsights.sort((a, b) => {
    const sevDiff = severityScore[a.severity] - severityScore[b.severity];
    if (sevDiff !== 0) return sevDiff;
    // Same severity: prioritize insights with concrete CU savings
    return (b.estimatedCUSavings ?? 0) - (a.estimatedCUSavings ?? 0);
  });

  const totalEstimatedSavings = mergedInsights.reduce(
    (sum, i) => sum + (i.estimatedCUSavings || 0),
    0
  );

  return {
    primaryBottleneck: mergedInsights[0] || null,
    insights: mergedInsights,
    totalEstimatedSavings,
  };
};
