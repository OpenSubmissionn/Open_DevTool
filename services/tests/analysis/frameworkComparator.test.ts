import { describe, it, expect } from 'vitest';
import { compareFrameworks, validateMainnetSamples } from '../../src/analysis/frameworkComparator';
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

describe('Enriched registry and mainnet validation', () => {
  it('should detect Anchor using AnchorError', () => {
    const result = compareFrameworks(['AnchorError thrown'], {
      totalConsumed: 45_000,
      totalLimit: 0,
      utilizationPercent: 0,
      perInstruction: [],
      bottleneck: null,
    });

    expect(result.current.framework).toBe('anchor');
    expect(result.current.confidence).toBe(0.9);
  });

  it('should detect Steel using steel:: signal', () => {
    const result = compareFrameworks(['steel:: instruction matched'], {
      totalConsumed: 35_000,
      totalLimit: 0,
      utilizationPercent: 0,
      perInstruction: [],
      bottleneck: null,
    });

    expect(result.current.framework).toBe('steel');
    expect(result.current.confidence).toBe(0.75);
  });

  it('should detect Native with solana_program:: signal and higher confidence', () => {
    const result = compareFrameworks(['solana_program:: entrypoint called'], {
      totalConsumed: 25_000,
      totalLimit: 0,
      utilizationPercent: 0,
      perInstruction: [],
      bottleneck: null,
    });

    expect(result.current.framework).toBe('native');
    expect(result.current.confidence).toBe(0.65);
  });

  it('should expose benchmark metadata on the current result', () => {
    const result = compareFrameworks(['Program log: Instruction: Transfer'], {
      totalConsumed: 50_000,
      totalLimit: 0,
      utilizationPercent: 0,
      perInstruction: [],
      bottleneck: null,
    });

    expect(result.current.source).toBe('measured');
    expect(result.current.note).toEqual(expect.any(String));
    expect(result.current.note).not.toHaveLength(0);
  });

  it('should validate a set of mainnet samples and summarize detection results', () => {
    const samples = [
      ...Array.from({ length: 8 }, (_, index) => ({
        signature: `sig-anchor-${index + 1}`,
        logMessages: ['Program log: Instruction: Transfer'],
        totalConsumed: 40_000 + index * 2_000,
      })),
      ...Array.from({ length: 6 }, (_, index) => ({
        signature: `sig-steel-${index + 1}`,
        logMessages: ['steel:: op'],
        totalConsumed: 30_000 + index * 3_000,
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        signature: `sig-native-${index + 1}`,
        logMessages: ['solana_program:: entrypoint'],
        totalConsumed: 20_000 + index * 10_000,
      })),
      ...Array.from({ length: 3 }, (_, index) => ({
        signature: `sig-unknown-${index + 1}`,
        logMessages: [],
        totalConsumed: 0,
      })),
    ];

    const report = validateMainnetSamples(samples);

    expect(report.total).toBe(20);
    expect(report.detected).toBe(17);
    expect(report.detectionRate).toBe(85);
    expect(report.missingBenchmarks).toHaveLength(3);
    expect(report.results).toHaveLength(20);
    expect(
      report.results.every((r) => r.alternatives.length > 0 || r.framework === 'unknown')
    ).toBe(true);
  });
});
