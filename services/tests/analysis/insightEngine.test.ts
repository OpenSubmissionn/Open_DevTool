import { describe, it, expect } from 'vitest';
import { analyzeTransaction } from '../../src/analysis/insightEngine';
import { AnalyzedTransaction } from '../../src/analysis/types';

describe('Insight Engine - Unit Tests (MVP Full Coverage)', () => {
  
  /**
   * Rule 1: Execution Failure
   */
  it('should detect a critical execution failure', () => {
    const mockTx = {
      parsed: { success: false },
      cuProfile: { totalConsumed: 5000, totalLimit: 200000, utilizationPercent: 2.5 },
      cpiTree: { totalDepth: 1 }
    } as unknown as AnalyzedTransaction;

    const report = analyzeTransaction(mockTx);
    expect(report.insights.some(i => i.type === 'EXECUTION_FAILURE')).toBe(true);
    expect(report.insights[0].severity).toBe('critical');
  });

  /**
   * Rule 2: CU Bottleneck
   */
  it('should identify a performance bottleneck', () => {
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

    const report = analyzeTransaction(mockTx);
    expect(report.insights.some(i => i.type === 'CU_BOTTLENECK')).toBe(true);
  });

  /**
   * Rule 3: CU Waste
   */
  it('should suggest optimization for high CU waste', () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: {
        totalConsumed: 40000,
        totalLimit: 400000,
        utilizationPercent: 10
      },
      cpiTree: { totalDepth: 1 }
    } as unknown as AnalyzedTransaction;

    const report = analyzeTransaction(mockTx);
    const waste = report.insights.find(i => i.type === 'CU_WASTE');
    expect(waste).toBeDefined();
    // Testamos apenas o '44' para evitar conflitos de ponto/vírgula (40k * 1.1)
    expect(waste?.recommendation).toContain('44'); 
  });

  /**
   * Rule 4: Budget Risk (>90%)
   */
  it('should warn when transaction is near compute budget limit', () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: {
        totalConsumed: 185000,
        totalLimit: 200000,
        utilizationPercent: 92.5 // > 90%
      },
      cpiTree: { totalDepth: 1 }
    } as unknown as AnalyzedTransaction;

    const report = analyzeTransaction(mockTx);
    expect(report.insights.some(i => i.type === 'BUDGET_RISK')).toBe(true);
    expect(report.insights.find(i => i.type === 'BUDGET_RISK')?.severity).toBe('warning');
  });

  /**
   * Rule 5: Deep CPI (Depth > 3)
   */
  it('should detect high complexity in deep CPI trees', () => {
    const mockTx = {
      parsed: { success: true },
      cuProfile: { totalConsumed: 10000, totalLimit: 200000, utilizationPercent: 5 },
      cpiTree: { totalDepth: 5 } // > 3
    } as unknown as AnalyzedTransaction;

    const report = analyzeTransaction(mockTx);
    expect(report.insights.some(i => i.type === 'DEEP_CPI')).toBe(true);
    expect(report.insights.find(i => i.type === 'DEEP_CPI')?.severity).toBe('info');
  });

  /**
   * Logic: Ranking System
   */
  it('should rank critical failure above all other insights', () => {
    const mockTx = {
      parsed: { success: false }, // Critical
      cuProfile: { 
        totalConsumed: 195000, 
        totalLimit: 200000, 
        utilizationPercent: 97.5 // Warning
      },
      cpiTree: { totalDepth: 5 } // Info
    } as unknown as AnalyzedTransaction;

    const report = analyzeTransaction(mockTx);
    expect(report.insights[0].type).toBe('EXECUTION_FAILURE');
    expect(report.insights[1].type).toBe('BUDGET_RISK');
  });
});