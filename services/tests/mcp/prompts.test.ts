import { describe, it, expect } from 'vitest';
import {
  classifyComplexity,
  buildPromptContext,
  FRAMEWORK_OPTIMIZATION_EXAMPLES,
  TRADE_OFFS,
  CU_REFERENCES,
  OPERATION_COMPLEXITY,
} from '../../src/mcp/prompts';

describe('classifyComplexity', () => {
  it('classifies values up to 5_000 CU as simple', () => {
    expect(classifyComplexity(0)).toBe('simple');
    expect(classifyComplexity(2_500)).toBe('simple');
    expect(classifyComplexity(5_000)).toBe('simple');
  });

  it('classifies values between simple and medium thresholds as medium', () => {
    expect(classifyComplexity(5_001)).toBe('medium');
    expect(classifyComplexity(25_000)).toBe('medium');
    expect(classifyComplexity(50_000)).toBe('medium');
  });

  it('classifies values above the medium threshold as complex', () => {
    expect(classifyComplexity(50_001)).toBe('complex');
    expect(classifyComplexity(120_000)).toBe('complex');
    expect(classifyComplexity(1_000_000)).toBe('complex');
  });
});

describe('FRAMEWORK_OPTIMIZATION_EXAMPLES', () => {
  it('provides at least one example for every supported framework', () => {
    expect(FRAMEWORK_OPTIMIZATION_EXAMPLES.anchor.length).toBeGreaterThan(0);
    expect(FRAMEWORK_OPTIMIZATION_EXAMPLES.steel.length).toBeGreaterThan(0);
    expect(FRAMEWORK_OPTIMIZATION_EXAMPLES.native.length).toBeGreaterThan(0);
  });

  it('includes a numeric cuSaving on every example', () => {
    const allExamples = [
      ...FRAMEWORK_OPTIMIZATION_EXAMPLES.anchor,
      ...FRAMEWORK_OPTIMIZATION_EXAMPLES.steel,
      ...FRAMEWORK_OPTIMIZATION_EXAMPLES.native,
    ];

    for (const example of allExamples) {
      expect(typeof example.cuSaving).toBe('number');
      expect(example.pattern.length).toBeGreaterThan(0);
      expect(example.alternative.length).toBeGreaterThan(0);
    }
  });
});

describe('TRADE_OFFS', () => {
  it('exposes more than one trade-off so prompts have variety', () => {
    expect(TRADE_OFFS.length).toBeGreaterThan(1);
  });

  it('grounds each trade-off with an axis, example, and recommendation', () => {
    for (const tradeOff of TRADE_OFFS) {
      expect(tradeOff.axis.length).toBeGreaterThan(0);
      expect(tradeOff.example.length).toBeGreaterThan(0);
      expect(tradeOff.recommendation.length).toBeGreaterThan(0);
    }
  });
});

describe('CU_REFERENCES', () => {
  it('contains entries with positive CU estimates', () => {
    expect(CU_REFERENCES.length).toBeGreaterThan(0);
    for (const ref of CU_REFERENCES) {
      expect(ref.estimatedCU).toBeGreaterThan(0);
    }
  });
});

describe('OPERATION_COMPLEXITY thresholds', () => {
  it('orders bands so simple < medium < complex', () => {
    expect(OPERATION_COMPLEXITY.simple.maxCU).toBeLessThan(OPERATION_COMPLEXITY.medium.maxCU);
    expect(OPERATION_COMPLEXITY.medium.maxCU).toBeLessThan(OPERATION_COMPLEXITY.complex.maxCU);
  });
});

describe('buildPromptContext', () => {
  it('returns the detected framework and complexity unchanged', () => {
    const result = buildPromptContext({
      framework: 'anchor',
      cuConsumed: 60_000,
    });

    expect(result.detectedFramework).toBe('anchor');
    expect(result.operationComplexity).toBe('complex');
  });

  it('selects optimization examples specific to the detected framework', () => {
    const anchorResult = buildPromptContext({ framework: 'anchor', cuConsumed: 1_000 });
    const steelResult = buildPromptContext({ framework: 'steel', cuConsumed: 1_000 });

    expect(anchorResult.optimizationExamples).toEqual(FRAMEWORK_OPTIMIZATION_EXAMPLES.anchor);
    expect(steelResult.optimizationExamples).toEqual(FRAMEWORK_OPTIMIZATION_EXAMPLES.steel);
  });

  it('falls back to native examples when framework is unknown', () => {
    const result = buildPromptContext({ framework: 'unknown', cuConsumed: 1_000 });
    expect(result.optimizationExamples).toEqual(FRAMEWORK_OPTIMIZATION_EXAMPLES.native);
  });

  it('always includes the full trade-off list', () => {
    const result = buildPromptContext({ framework: 'native', cuConsumed: 1_000 });
    expect(result.tradeOffs).toEqual(TRADE_OFFS);
  });

  it('filters CU references by operationHint when provided', () => {
    const result = buildPromptContext({
      framework: 'anchor',
      cuConsumed: 60_000,
      operationHint: 'swap',
    });

    expect(result.cuReferences.length).toBeGreaterThan(0);
    for (const ref of result.cuReferences) {
      expect(ref.operation).toBe('swap');
    }
  });

  it('returns framework + native CU references when no operationHint is provided', () => {
    const result = buildPromptContext({ framework: 'anchor', cuConsumed: 1_000 });

    expect(result.cuReferences.length).toBeGreaterThan(0);
    for (const ref of result.cuReferences) {
      expect(['anchor', 'native']).toContain(ref.framework);
    }
  });
});
