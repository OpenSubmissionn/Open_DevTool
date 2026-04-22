import { describe, it, expect } from 'vitest';
import { renderJSON } from '../../src/analysis/renderer';
import { AnalyzedTransaction, Insight } from '../../src/analysis/types';

describe('JSON Renderer - God Mode', () => {
  
  it('should render a complete and valid transaction report', () => {
    const mockAnalyzed = {
      signature: '5K8pWv...',
      success: true,

      raw: {} as any,
      parsed: {
        signature: '5K8pWv...',
        slot: 210456789,
        blockTime: 1713685750,
        success: true,
        fee: 5000,
        instructions: []
      },

      cuProfile: {
        totalConsumed: 54200,
        totalLimit: 200000,
        utilizationPercent: 27.1,
        perInstruction: [],
        bottleneck: null
      },

      cpiTree: {
        root: [],
        totalDepth: 0,
        nodeCount: 0
      },

      accountDiffs: [],
      logs: {
        byProgram: {},
        errors: [],
        totalLines: 0
      }
    } as AnalyzedTransaction;

    const mockInsights: Insight[] = [
      { 
        type: 'EFFICIENCY',
        severity: 'info',
        title: 'Optimized CU usage',
        message: 'Optimized CU usage detected',
        recommendation: 'No action needed'
      }
    ];

    const result = renderJSON(mockAnalyzed, mockInsights);
    const parsed = JSON.parse(result);

    expect(parsed.transaction.signature).toBe('5K8pWv...');
    expect(parsed.transaction.success).toBe(true);

    expect(parsed.computeUnits.utilization).toBeDefined();
    
    expect(parsed.insights).toHaveLength(1);
    expect(parsed.insights[0].type).toBe('EFFICIENCY');

    expect(parsed.metadata.engine).toBe('OPEN-Insight-Engine-God-Mode');
    expect(parsed.metadata).toHaveProperty('version');
    expect(new Date(parsed.metadata.generatedAt).getTime()).not.toBeNaN();
  });

  it('should provide default values when data is partially missing', () => {
    const incompleteData = { signature: 'SHORT_SIG' };
    const result = renderJSON(incompleteData as any, []);
    const parsed = JSON.parse(result);

    expect(parsed.transaction.slot).toBe(0);
    expect(parsed.computeUnits.consumed).toBe(0);
    expect(parsed.accounts).toEqual([]);
  });

  it('should gracefully handle and return a JSON error when input is null', () => {
    const result = renderJSON(null as any, []);
    const parsed = JSON.parse(result);

    expect(parsed).toHaveProperty('error', 'Render Error');
    expect(parsed).toHaveProperty('message', 'No analysis data provided to the renderer.');
    expect(parsed).toHaveProperty('timestamp');
  });

  it('should output a string formatted with 2 spaces for readability', () => {
    const mockData = { signature: 'test' };
    const result = renderJSON(mockData as any, []);
    
    expect(result).toContain('\n  "transaction": {');
  });

});