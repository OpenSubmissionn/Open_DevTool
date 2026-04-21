import { describe, it, expect } from 'vitest';
import { renderJSON } from '../../src/analysis/renderer';

describe('JSON Renderer - God Mode', () => {
  
  it('should render a complete and valid transaction report', () => {
    // Mock data representing a complex analysis result
    const mockAnalyzed = {
      signature: '5K8pWv...',
      slot: 210456789,
      blockTime: 1713685750,
      computeUnits: {
        consumed: 54200,
        limit: 200000,
        utilization: 0.271
      },
      accountDiffs: [
        { address: 'vines1...', change: -5000000 },
        { address: 'target2...', change: 4900000 }
      ],
      error: null
    };

    const mockInsights = [
      { 
        type: 'EFFICIENCY', 
        level: 'high', 
        message: 'Optimized CU usage detected', 
        details: { ratio: 0.27 } 
      }
    ];

    const result = renderJSON(mockAnalyzed, mockInsights);
    const parsed = JSON.parse(result);

    // Assertions for Transaction block
    expect(parsed.transaction.signature).toBe('5K8pWv...');
    expect(parsed.transaction.success).toBe(true);

    // Assertions for Compute Units (checking numerical precision)
    expect(parsed.computeUnits.utilization).toBe(0.271);
    
    // Assertions for Insights
    expect(parsed.insights).toHaveLength(1);
    expect(parsed.insights[0].type).toBe('EFFICIENCY');

    // Assertions for Metadata
    expect(parsed.metadata.engine).toBe('OPEN-Insight-Engine-God-Mode');
    expect(parsed.metadata).toHaveProperty('version');
    expect(new Date(parsed.metadata.generatedAt).getTime()).not.toBeNaN();
  });

  it('should provide default values when data is partially missing', () => {
    const incompleteData = { signature: 'SHORT_SIG' };
    const result = renderJSON(incompleteData, []);
    const parsed = JSON.parse(result);

    expect(parsed.transaction.slot).toBe(0);
    expect(parsed.computeUnits.consumed).toBe(0);
    expect(parsed.accounts).toEqual([]);
  });

  it('should gracefully handle and return a JSON error when input is null', () => {
    // Testing the fail-safe mechanism
    const result = renderJSON(null as any, []);
    const parsed = JSON.parse(result);

    expect(parsed).toHaveProperty('error', 'Render Error');
    expect(parsed).toHaveProperty('message', 'No analysis data provided to the renderer.');
    expect(parsed).toHaveProperty('timestamp');
  });

  it('should output a string formatted with 2 spaces for readability', () => {
    const mockData = { signature: 'test' };
    const result = renderJSON(mockData, []);
    
    // Check if the string contains newlines and indentation
    expect(result).toContain('\n  "transaction": {');
  });

});