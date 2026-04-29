import type { AnalyzedTransaction, Insight, InsightReport } from './types';

export interface BatchEntry {
  analyzed: AnalyzedTransaction;
  insights: InsightReport;
}

export interface PatternSummary {
  type: string;
  severity: Insight['severity'];
  frequency: number;
  percentage: number;
  totalCUSavings: number;
  topRecommendation: string;
}

export interface FrameworkTrend {
  framework: string;
  count: number;
  percentage: number;
  avgCU: number;
}

export interface CostSummary {
  totalFeeLamports: number;
  totalFeeSOL: number;
  totalFeeUSD: number | null;
  avgFeeLamports: number;
  totalCU: number;
  avgCU: number;
}

export interface BatchTransactionSummary {
  signature: string;
  success: boolean;
  cuConsumed: number;
  feeLamports: number;
  topInsight: string | null;
  insightCount: number;
}

export interface BatchReport {
  summary: {
    total: number;
    successful: number;
    failed: number;
    processedAt: string;
    network: string;
  };
  costs: CostSummary;
  patterns: PatternSummary[];
  frameworkTrends: FrameworkTrend[];
  globalRecommendations: string[];
  transactions: BatchTransactionSummary[];
}

function detectFramework(analyzed: AnalyzedTransaction): string {
  const logs = analyzed.raw?.logMessages ?? [];
  for (const log of logs) {
    if (log.includes('AnchorError') || log.includes('anchor_lang')) return 'Anchor';
    if (log.includes('steel::')) return 'Steel';
    if (log.includes('solana_program::')) return 'Native';
  }
  return 'Unknown';
}

export function aggregateBatch(entries: BatchEntry[], network: string): BatchReport {
  const total = entries.length;
  const successful = entries.filter((e) => e.analyzed.success).length;
  const failed = total - successful;

  // ── Cost aggregation ──────────────────────────────────────────────────────
  let totalFeeLamports = 0;
  let totalCU = 0;
  let feeUSDSum = 0;
  let usdCount = 0;

  for (const { analyzed } of entries) {
    totalFeeLamports += analyzed.parsed?.fee ?? 0;
    totalCU += analyzed.raw?.computeUnitsConsumed ?? analyzed.cuProfile?.totalConsumed ?? 0;
    if (analyzed.cuCost?.feeUSD != null) {
      feeUSDSum += analyzed.cuCost.feeUSD;
      usdCount++;
    }
  }

  const costs: CostSummary = {
    totalFeeLamports,
    totalFeeSOL: totalFeeLamports / 1_000_000_000,
    totalFeeUSD: usdCount > 0 ? feeUSDSum : null,
    avgFeeLamports: total > 0 ? Math.round(totalFeeLamports / total) : 0,
    totalCU,
    avgCU: total > 0 ? Math.round(totalCU / total) : 0,
  };

  // ── Insight pattern aggregation ───────────────────────────────────────────
  const typeCounts = new Map<
    string,
    { count: number; severity: Insight['severity']; cuSavings: number; recommendations: string[] }
  >();

  for (const { insights } of entries) {
    for (const insight of insights.insights) {
      const existing = typeCounts.get(insight.type);
      if (existing) {
        existing.count++;
        existing.cuSavings += insight.estimatedCUSavings ?? 0;
        if (insight.recommendation && !existing.recommendations.includes(insight.recommendation)) {
          existing.recommendations.push(insight.recommendation);
        }
      } else {
        typeCounts.set(insight.type, {
          count: 1,
          severity: insight.severity,
          cuSavings: insight.estimatedCUSavings ?? 0,
          recommendations: insight.recommendation ? [insight.recommendation] : [],
        });
      }
    }
  }

  const patterns: PatternSummary[] = Array.from(typeCounts.entries())
    .map(([type, data]) => ({
      type,
      severity: data.severity,
      frequency: data.count,
      percentage: total > 0 ? Math.round((data.count / total) * 100) : 0,
      totalCUSavings: data.cuSavings,
      topRecommendation: data.recommendations[0] ?? '',
    }))
    .sort((a, b) => b.frequency - a.frequency);

  // ── Framework trend detection ─────────────────────────────────────────────
  const frameworkCounts = new Map<string, { count: number; totalCU: number }>();

  for (const { analyzed } of entries) {
    const framework = detectFramework(analyzed);
    const cu = analyzed.raw?.computeUnitsConsumed ?? analyzed.cuProfile?.totalConsumed ?? 0;
    const existing = frameworkCounts.get(framework);
    if (existing) {
      existing.count++;
      existing.totalCU += cu;
    } else {
      frameworkCounts.set(framework, { count: 1, totalCU: cu });
    }
  }

  const frameworkTrends: FrameworkTrend[] = Array.from(frameworkCounts.entries())
    .map(([framework, data]) => ({
      framework,
      count: data.count,
      percentage: total > 0 ? Math.round((data.count / total) * 100) : 0,
      avgCU: data.count > 0 ? Math.round(data.totalCU / data.count) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── Global recommendations ────────────────────────────────────────────────
  const globalRecommendations: string[] = [];

  for (const pattern of patterns) {
    if (pattern.percentage >= 50 && pattern.severity === 'critical') {
      globalRecommendations.push(
        `[CRITICAL] ${pattern.type} affects ${pattern.percentage}% of transactions. ${pattern.topRecommendation}`
      );
    }
  }

  const cuWaste = patterns.find((p) => p.type === 'CU_WASTE');
  if (cuWaste && cuWaste.percentage >= 30) {
    globalRecommendations.push(
      `${cuWaste.percentage}% of transactions over-allocate compute budget. Align CU limits to actual consumption.`
    );
  }

  if (total > 0 && failed / total > 0.1) {
    globalRecommendations.push(
      `${Math.round((failed / total) * 100)}% failure rate detected. Review account constraints and program logic.`
    );
  }

  const totalSavings = patterns.reduce((sum, p) => sum + p.totalCUSavings, 0);
  if (totalSavings > 0) {
    globalRecommendations.push(
      `Estimated ${totalSavings.toLocaleString()} CU savings available across all transactions.`
    );
  }

  if (globalRecommendations.length === 0) {
    globalRecommendations.push('No recurring critical patterns detected. Continue monitoring.');
  }

  // ── Per-transaction summary ───────────────────────────────────────────────
  const transactions: BatchTransactionSummary[] = entries.map(({ analyzed, insights }) => ({
    signature:
      analyzed.raw?.signature ?? analyzed.parsed?.signature ?? analyzed.signature ?? 'unknown',
    success: analyzed.success ?? analyzed.parsed?.success ?? false,
    cuConsumed: analyzed.raw?.computeUnitsConsumed ?? analyzed.cuProfile?.totalConsumed ?? 0,
    feeLamports: analyzed.parsed?.fee ?? 0,
    topInsight: insights.primaryBottleneck?.title ?? insights.insights[0]?.title ?? null,
    insightCount: insights.insights.length,
  }));

  return {
    summary: { total, successful, failed, processedAt: new Date().toISOString(), network },
    costs,
    patterns,
    frameworkTrends,
    globalRecommendations,
    transactions,
  };
}
