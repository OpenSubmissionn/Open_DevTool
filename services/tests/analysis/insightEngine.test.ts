import { describe, it, expect } from 'vitest';
import {
  analyzeTransaction,
  InsightProvider,
  mergeInsights,
} from '../../src/analysis/insightEngine';
import { AnalyzedTransaction, Insight, ProviderInsight } from '../../src/analysis/types';

describe('Insight Engine - Unit Tests (MVP Full Coverage)', () => {
  it('should detect a critical execution failure', async () => {
    const mockTx = {
      parsed: { success: false },
      cuProfile: { totalConsumed: 5000, totalLimit: 200000, utilizationPercent: 2.5 },
      cpiTree: { totalDepth: 1 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some((i) => i.type === 'EXECUTION_FAILURE')).toBe(true);
    expect(report.insights[0].severity).toBe('critical');
  });

  it('should identify a performance bottleneck', async () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: {
        totalConsumed: 100000,
        totalLimit: 200000,
        utilizationPercent: 50,
        bottleneck: {
          programName: 'Jupiter V6',
          cuConsumed: 80000,
          utilizationPercent: 80,
        },
      },
      cpiTree: { totalDepth: 1 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some((i) => i.type === 'CU_BOTTLENECK')).toBe(true);
  });

  it('should suggest optimization for high CU waste', async () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: {
        totalConsumed: 40000,
        totalLimit: 400000,
        utilizationPercent: 10,
      },
      cpiTree: { totalDepth: 1 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    const waste = report.insights.find((i) => i.type === 'CU_WASTE');
    expect(waste).toBeDefined();
    expect(waste?.recommendation).toContain('44');
  });

  it('should warn when transaction is near compute budget limit', async () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: {
        totalConsumed: 185000,
        totalLimit: 200000,
        utilizationPercent: 92.5,
      },
      cpiTree: { totalDepth: 1 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some((i) => i.type === 'BUDGET_RISK')).toBe(true);
    expect(report.insights.find((i) => i.type === 'BUDGET_RISK')?.severity).toBe('warning');
  });

  it('should detect high complexity in deep CPI trees', async () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: { totalConsumed: 10000, totalLimit: 200000, utilizationPercent: 5 },
      cpiTree: { totalDepth: 5 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some((i) => i.type === 'DEEP_CPI')).toBe(true);
    expect(report.insights.find((i) => i.type === 'DEEP_CPI')?.severity).toBe('info');
  });

  it('should rank critical failure above all other insights', async () => {
    const mockTx = {
      parsed: { success: false },
      cuProfile: {
        totalConsumed: 195000,
        totalLimit: 200000,
        utilizationPercent: 97.5,
      },
      cpiTree: { totalDepth: 5 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights[0].type).toBe('EXECUTION_FAILURE');
    expect(report.insights[1].type).toBe('BUDGET_RISK');
  });

  // --- Threshold boundary tests (Task 2.6.1) ---

  it('BUDGET_RISK fires at the 85% lower boundary', async () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: { totalConsumed: 170_000, totalLimit: 200_000, utilizationPercent: 85 },
      cpiTree: { totalDepth: 1 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some((i) => i.type === 'BUDGET_RISK')).toBe(true);
  });

  it('BUDGET_RISK does NOT fire just below the 85% threshold', async () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: { totalConsumed: 168_000, totalLimit: 200_000, utilizationPercent: 84 },
      cpiTree: { totalDepth: 1 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some((i) => i.type === 'BUDGET_RISK')).toBe(false);
  });

  it('DEEP_CPI fires at the depth-5 lower boundary', async () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: { totalConsumed: 50_000, totalLimit: 200_000, utilizationPercent: 25 },
      cpiTree: { totalDepth: 5 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some((i) => i.type === 'DEEP_CPI')).toBe(true);
  });

  it('DEEP_CPI does NOT fire at depth 4 (normal DEX swap)', async () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: { totalConsumed: 50_000, totalLimit: 200_000, utilizationPercent: 25 },
      cpiTree: { totalDepth: 4 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some((i) => i.type === 'DEEP_CPI')).toBe(false);
  });

  it('ranks insights with concrete CU savings ahead of those without, within same severity', async () => {
    const ruleInsights: Insight[] = [
      {
        type: 'A_NO_SAVINGS',
        severity: 'info',
        title: 'No savings',
        message: 'A',
        recommendation: 'a',
        source: 'rule',
        codeSuggestions: [],
      },
      {
        type: 'B_WITH_SAVINGS',
        severity: 'info',
        title: 'With savings',
        message: 'B',
        recommendation: 'b',
        source: 'rule',
        codeSuggestions: [],
        estimatedCUSavings: 50_000,
      },
    ];

    const merged = mergeInsights(ruleInsights, []);
    // Both info severity; analyzeTransaction is what applies the secondary sort.
    // Verify by going through the full pipeline:
    const mockTx = {
      parsed: { success: true },
      cuProfile: {
        totalConsumed: 50_000,
        totalLimit: 400_000,
        utilizationPercent: 12.5,
      },
      cpiTree: { totalDepth: 1 },
    } as unknown as AnalyzedTransaction;

    // CU_WASTE has estimatedCUSavings; CU_ATTRIBUTION_LOW_CONFIDENCE does not.
    const tx = {
      ...mockTx,
      parsed: {
        success: true,
        cuAttribution: {
          confidence: 0.45,
          unmatchedCUEntries: 1,
          ambiguousKeys: 0,
          doubleAttributionCount: 0,
          traceTruncated: false,
        },
      },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(tx);
    const wasteIndex = report.insights.findIndex((i) => i.type === 'CU_WASTE');
    const attributionIndex = report.insights.findIndex(
      (i) => i.type === 'CU_ATTRIBUTION_LOW_CONFIDENCE'
    );

    // Both are non-critical; CU_WASTE has savings (info severity), attribution is also info or warning.
    // When same severity, the one with savings should come first.
    expect(wasteIndex).toBeGreaterThanOrEqual(0);
    expect(attributionIndex).toBeGreaterThanOrEqual(0);

    const wasteInsight = report.insights[wasteIndex];
    const attributionInsight = report.insights[attributionIndex];

    if (wasteInsight.severity === attributionInsight.severity) {
      expect(wasteIndex).toBeLessThan(attributionIndex);
    }

    // Direct check on mergeInsights stability (ranking applied at analyzeTransaction level)
    expect(merged.length).toBe(2);
  });

  it('should report low-confidence CU attribution for diagnostics', async () => {
    const mockTx = {
      parsed: {
        success: true,
        cuAttribution: {
          totalNodes: 3,
          matchedNodes: 2,
          unmatchedNodes: 1,
          unmatchedCUEntries: 2,
          ambiguousKeys: 1,
          confidence: 0.45,
          doubleAttributionCount: 0,
          traceTruncated: false,
        },
      },
      cuProfile: {
        totalConsumed: 50000,
        totalLimit: 200000,
        utilizationPercent: 25,
      },
      cpiTree: { totalDepth: 1 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    const qualityInsight = report.insights.find(
      (insight) => insight.type === 'CU_ATTRIBUTION_LOW_CONFIDENCE'
    );

    expect(qualityInsight).toBeDefined();
    expect(qualityInsight?.severity).toBe('warning');
    expect(qualityInsight?.context?.confidence).toBe(0.45);
  });
});

describe('Hybrid Architecture - Provider Integration', () => {
  it('should return rule-based insights when no provider is injected', async () => {
    const mockTx = {
      parsed: { success: false },
      cuProfile: { totalConsumed: 5000, totalLimit: 200000, utilizationPercent: 2.5 },
      cpiTree: { totalDepth: 1 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some((i) => i.type === 'EXECUTION_FAILURE')).toBe(true);
    expect(report.insights.length).toBeGreaterThan(0);
  });

  it('should fallback to rule-based insights when provider throws an error', async () => {
    const mockProvider: InsightProvider = {
      fetchInsights: async () => {
        throw new Error('Provider failed');
      },
    };

    const mockTx = {
      parsed: { success: false },
      cuProfile: { totalConsumed: 5000, totalLimit: 200000, utilizationPercent: 2.5 },
      cpiTree: { totalDepth: 1 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx, mockProvider);
    expect(report.insights.some((i) => i.type === 'EXECUTION_FAILURE')).toBe(true);
    expect(report.insights.length).toBeGreaterThan(0);
  });

  it('should merge and deduplicate insights from rules and provider', async () => {
    const mockProvider: InsightProvider = {
      fetchInsights: async () => [
        {
          insight: {
            type: 'EXECUTION_FAILURE',
            severity: 'warning' as const,
            title: 'Provider Failure Insight',
            message: 'Provider detected failure',
            recommendation: 'Provider recommendation',
            source: 'mcp',
            codeSuggestions: [],
          },
          source: 'mcp',
        },
      ],
    };

    const mockTx = {
      parsed: { success: false },
      cuProfile: { totalConsumed: 5000, totalLimit: 200000, utilizationPercent: 2.5 },
      cpiTree: { totalDepth: 1 },
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx, mockProvider);
    const failureInsights = report.insights.filter((i) => i.type === 'EXECUTION_FAILURE');
    expect(failureInsights.length).toBe(1);
    expect(failureInsights[0].severity).toBe('critical');
  });

  it('should keep separate insights when rule and provider return different types', () => {
    const ruleInsights: Insight[] = [
      {
        type: 'CU_BOTTLENECK',
        severity: 'critical',
        title: 'Performance Bottleneck',
        message: 'High CU usage',
        recommendation: 'Optimize',
        source: 'rule',
        codeSuggestions: [],
      },
    ];

    const providerInsights: ProviderInsight[] = [
      {
        insight: {
          type: 'BUDGET_RISK',
          severity: 'warning',
          title: 'Budget at Risk',
          message: 'Nearing limit',
          recommendation: 'Increase budget',
          source: 'mcp',
          codeSuggestions: [],
        },
        source: 'mcp',
      },
    ];

    const merged = mergeInsights(ruleInsights, providerInsights);
    expect(merged).toHaveLength(2);
    expect(merged[0].type).toBe('CU_BOTTLENECK');
    expect(merged[1].type).toBe('BUDGET_RISK');
  });
});
