import { describe, it, expect } from 'vitest';
import { compareFrameworks } from '../../src/analysis/frameworkComparator';
import { CUProfile } from '../../src/analysis/types';

describe('Framework Comparator', () => {
  it('should detect Anchor and compare against Steel and Native benchmarks', () => {
    const logMessages = ['Program log: Instruction: Transfer'];
    const cuProfile: CUProfile = {
      totalConsumed: 50_000,
      totalLimit: 0,
      utilizationPercent: 0,
      perInstruction: [],
      bottleneck: null,
    };

    const result = compareFrameworks(logMessages, cuProfile);

    expect(result.current.framework).toBe('anchor');
    expect(result.current.confidence).toBe(0.9);
    expect(result.alternatives).toHaveLength(2);

    expect(result.alternatives[0]).toEqual({
      framework: 'native',
      avgCU: 30_000,
      deltaAbsolute: 20_000,
      deltaPercent: 40,
    });

    expect(result.alternatives[1]).toEqual({
      framework: 'steel',
      avgCU: 40_000,
      deltaAbsolute: 10_000,
      deltaPercent: 20,
    });
  });

  it('should return unknown framework with zero confidence when logMessages is empty', () => {
    const cuProfile: CUProfile = {
      totalConsumed: 10_000,
      totalLimit: 0,
      utilizationPercent: 0,
      perInstruction: [],
      bottleneck: null,
    };

    const result = compareFrameworks([], cuProfile);

    expect(result.current.framework).toBe('unknown');
    expect(result.current.confidence).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('should guard divide-by-zero and return zero deltaPercent when totalConsumed is 0', () => {
    const logMessages = ['Program log: steel operation completed'];
    const cuProfile: CUProfile = {
      totalConsumed: 0,
      totalLimit: 0,
      utilizationPercent: 0,
      perInstruction: [],
      bottleneck: null,
    };

    const result = compareFrameworks(logMessages, cuProfile);

    expect(result.current.framework).toBe('steel');
    expect(result.alternatives.every((alt) => alt.deltaPercent === 0)).toBe(true);
  });

  it('should sort alternative frameworks cheapest first', () => {
    const logMessages = ['Program log: Instruction: Transfer'];
    const cuProfile: CUProfile = {
      totalConsumed: 50_000,
      totalLimit: 0,
      utilizationPercent: 0,
      perInstruction: [],
      bottleneck: null,
    };

    const result = compareFrameworks(logMessages, cuProfile);

    expect(result.alternatives[0].framework).toBe('native');
    expect(result.alternatives[1].framework).toBe('steel');
  });
});
