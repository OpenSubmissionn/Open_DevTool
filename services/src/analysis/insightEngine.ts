import { 
  AnalyzedTransaction, 
  Insight, 
  InsightReport,
  InsightContext,
  ProviderInsight
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
 * Rule 1: Detects if the transaction failed.
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
    codeSuggestions: []
  };
};

/**
 * Rule 2: Identifies programs consuming a disproportionate amount of compute units.
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
    codeSuggestions: []
  };
};

/**
 * Rule 3: Detects overallocation of compute units to optimize fees.
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
    codeSuggestions: []
  };
};

/**
 * Rule 4: Budget Exceeded Risk (>90% utilization)
 */
const checkBudgetRisk = (tx: AnalyzedTransaction): Insight | null => {
  const utilizationPercent = getCanonicalUtilizationPercent(tx);
  if (utilizationPercent < 90) return null;

  return {
    type: 'BUDGET_RISK',
    severity: 'warning',
    title: 'Near Compute Budget Limit',
    message: `Transaction used ${utilizationPercent.toFixed(1)}% of its CU limit, risking random failures.`,
    recommendation: 'Slightly increase the compute budget limit or optimize high-cost instructions.',
    tags: ['performance', 'risk'],
    source: 'rule',
    codeSuggestions: []
  };
};

/**
 * Rule 5: Deep CPI (Depth > 3)
 */
const checkDeepCPI = (tx: AnalyzedTransaction): Insight | null => {
  if (tx.cpiTree.totalDepth <= 3) return null;

  return {
    type: 'DEEP_CPI',
    severity: 'info',
    title: 'High Execution Complexity',
    message: `Transaction has a CPI depth of ${tx.cpiTree.totalDepth}, indicating many nested program calls.`,
    recommendation: 'Deeply nested calls increase execution risk and gas costs. Consider flattening the logic.',
    tags: ['complexity'],
    source: 'rule',
    codeSuggestions: []
  };
};

// --- CORE ENGINE ---

/**
 * Merges insights from multiple providers, tagging sources and deduplicating.
 */
export function mergeInsights(ruleInsights: Insight[], mcpInsights: ProviderInsight[]): Insight[] {
  const allInsights: Insight[] = [];

  // Add rule insights
  allInsights.push(...ruleInsights);

  // Add MCP insights
  allInsights.push(...mcpInsights.map(pi => pi.insight));

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
      const ruleInsight = insights.find(i => i.source === 'rule');
      const mcpInsight = insights.find(i => i.source === 'mcp');

      if (ruleInsight && mcpInsight) {
        // Both sources agree on the same issue type
        merged.push({
          ...ruleInsight,
          source: 'hybrid',
          codeSuggestions: mcpInsight.codeSuggestions || []
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
  providers: InsightProvider[] = []
): Promise<InsightReport> => {
  // All 5 MVP Rules integrated here
  const rules = [
    checkFailure, 
    checkCUBottleneck, 
    checkCUWaste, 
    checkBudgetRisk, 
    checkDeepCPI
  ];

  const ruleInsights = rules
    .map(rule => rule(tx))
    .filter((i): i is Insight => i !== null);

  // Fetch insights from providers
  const providerResults: ProviderInsight[] = [];
  const context: InsightContext = { transaction: tx };

  for (const provider of providers) {
    try {
      const insights = await provider.fetchInsights(context);
      providerResults.push(...insights);
    } catch (error) {
      console.warn(`Provider ${provider.constructor.name} failed:`, error);
    }
  }

  // Merge insights with source tagging
  const mergedInsights = mergeInsights(ruleInsights, providerResults);

  // Sorting logic to ensure the user sees the most important things first
  const severityScore = { critical: 0, warning: 1, info: 2 };
  mergedInsights.sort((a, b) => severityScore[a.severity] - severityScore[b.severity]);

  return {
    primaryBottleneck: mergedInsights[0] || null,
    insights: mergedInsights,
    totalEstimatedSavings: tx.cuProfile.totalLimit - getCanonicalConsumed(tx)
  };
};