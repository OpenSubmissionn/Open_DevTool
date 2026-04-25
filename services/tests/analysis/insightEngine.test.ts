import { describe, it, expect } from 'vitest';
import { analyzeTransaction, InsightProvider, mergeInsights } from '../../src/analysis/insightEngine';
import { AnalyzedTransaction, Insight } from '../../src/analysis/types';

describe('Insight Engine - Unit Tests (MVP Full Coverage)', () => {
  
  /**
   * Rule 1: Execution Failure
   */
  it('should detect a critical execution failure', async () => {
    const mockTx = {
      parsed: { success: false },
      cuProfile: { totalConsumed: 5000, totalLimit: 200000, utilizationPercent: 2.5 },
      cpiTree: { totalDepth: 1 }
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some(i => i.type === 'EXECUTION_FAILURE')).toBe(true);
    expect(report.insights[0].severity).toBe('critical');
  });

  /**
   * Rule 2: CU Bottleneck
   */
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
          utilizationPercent: 80
        }
      },
      cpiTree: { totalDepth: 1 }
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some(i => i.type === 'CU_BOTTLENECK')).toBe(true);
  });

  /**
   * Rule 3: CU Waste
   */
  it('should suggest optimization for high CU waste', async () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: {
        totalConsumed: 40000,
        totalLimit: 400000,
        utilizationPercent: 10
      },
      cpiTree: { totalDepth: 1 }
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    const waste = report.insights.find(i => i.type === 'CU_WASTE');
    expect(waste).toBeDefined();
    expect(waste?.recommendation).toContain('44');
  });

  /**
   * Rule 4: Budget Risk (>90%)
   */
  it('should warn when transaction is near compute budget limit', async () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: {
        totalConsumed: 185000,
        totalLimit: 200000,
        utilizationPercent: 92.5
      },
      cpiTree: { totalDepth: 1 }
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some(i => i.type === 'BUDGET_RISK')).toBe(true);
    expect(report.insights.find(i => i.type === 'BUDGET_RISK')?.severity).toBe('warning');
  });

  /**
   * Rule 5: Deep CPI (Depth > 3)
   */
  it('should detect high complexity in deep CPI trees', async () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: { totalConsumed: 10000, totalLimit: 200000, utilizationPercent: 5 },
      cpiTree: { totalDepth: 5 }
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some(i => i.type === 'DEEP_CPI')).toBe(true);
    expect(report.insights.find(i => i.type === 'DEEP_CPI')?.severity).toBe('info');
  });

  /**
   * Ranking System: Critical > Warning > Info
   */
  it('should rank critical failure above all other insights', async () => {
    const mockTx = {
      parsed: { success: false },
      cuProfile: { 
        totalConsumed: 195000, 
        totalLimit: 200000, 
        utilizationPercent: 97.5
      },
      cpiTree: { totalDepth: 5 }
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights[0].type).toBe('EXECUTION_FAILURE');
    expect(report.insights[1].type).toBe('BUDGET_RISK');
  });
});

describe('Hybrid Architecture - Provider Integration', () => {
  
  /**
   * Fallback: No provider injected - rules-only operation
   */
  it('should return rule-based insights when no provider is injected', async () => {
    const mockTx = {
      parsed: { success: false },
      cuProfile: { totalConsumed: 5000, totalLimit: 200000, utilizationPercent: 2.5 },
      cpiTree: { totalDepth: 1 }
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx);
    expect(report.insights.some(i => i.type === 'EXECUTION_FAILURE')).toBe(true);
    expect(report.insights.length).toBeGreaterThan(0);
  });

  /**
   * Fallback: Provider throws error - graceful degradation
   */
  it('should fallback to rule-based insights when provider throws an error', async () => {
    const mockProvider: InsightProvider = {
      fetchInsights: async () => {
        throw new Error('Provider failed');
      }
    };

    const mockTx = {
      parsed: { success: false },
      cuProfile: { totalConsumed: 5000, totalLimit: 200000, utilizationPercent: 2.5 },
      cpiTree: { totalDepth: 1 }
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx, mockProvider);
    expect(report.insights.some(i => i.type === 'EXECUTION_FAILURE')).toBe(true);
    expect(report.insights.length).toBeGreaterThan(0);
  });

  /**
   * Merge: Deduplication by type, priority by severity
   */
  it('should merge and deduplicate insights from rules and provider', async () => {
    const mockProvider: InsightProvider = {
      fetchInsights: async () => [
        {
          type: 'EXECUTION_FAILURE',
          severity: 'warning' as const,
          title: 'Provider Failure Insight',
          message: 'Provider detected failure',
          recommendation: 'Provider recommendation'
        }
      ]
    };

    const mockTx = {
      parsed: { success: false },
      cuProfile: { totalConsumed: 5000, totalLimit: 200000, utilizationPercent: 2.5 },
      cpiTree: { totalDepth: 1 }
    } as unknown as AnalyzedTransaction;

    const report = await analyzeTransaction(mockTx, mockProvider);
    const failureInsights = report.insights.filter(i => i.type === 'EXECUTION_FAILURE');
    expect(failureInsights.length).toBe(1);
    expect(failureInsights[0].severity).toBe('critical');
  });

  /**
   * mergeInsights function: Different insight types
   */
  it('should keep separate insights when rule and provider return different types', () => {
    const ruleInsights: Insight[] = [
      {
        type: 'CU_BOTTLENECK',
        severity: 'critical',
        title: 'Performance Bottleneck',
        message: 'High CU usage',
        recommendation: 'Optimize'
      }
    ];

    const providerInsights: Insight[] = [
      {
        type: 'BUDGET_RISK',
        severity: 'warning',
        title: 'Budget at Risk',
        message: 'Nearing limit',
        recommendation: 'Increase budget'
      }
    ];

    const merged = mergeInsights(ruleInsights, providerInsights);
    expect(merged).toHaveLength(2);
    expect(merged[0].type).toBe('CU_BOTTLENECK');
    expect(merged[1].type).toBe('BUDGET_RISK');
  });
});