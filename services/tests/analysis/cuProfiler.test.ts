import { describe, it, expect } from 'vitest';
import { profileCU } from '../../src/analysis/cuProfiler';
import cuNormalLogs from '../fixtures/cu-profiler-normal.json';
import cuBottleneckLogs from '../fixtures/cu-profiler-bottleneck.json';
import cuMultipleInstructionsLogs from '../fixtures/cu-profiler-multiple-instructions.json';

describe('CU Profiler', () => {
  it('should correctly profile CU for normal consumption', () => {
    const profile = profileCU(cuNormalLogs);

    expect(profile.totalConsumed).toBe(8000);
    expect(profile.totalLimit).toBe(600000);
    expect(profile.utilizationPercent).toBeCloseTo((8000 / 600000) * 100);
    expect(profile.perInstruction.length).toBe(3);
    expect(profile.bottleneck?.cuConsumed).toBe(5000); // <-- CORRIGIDO
  });

  it('should correctly identify the bottleneck instruction', () => {
    const profile = profileCU(cuBottleneckLogs);

    expect(profile.totalConsumed).toBe(153000);
    expect(profile.totalLimit).toBe(600000);
    expect(profile.utilizationPercent).toBeCloseTo((153000 / 600000) * 100);
    expect(profile.perInstruction.length).toBe(3);
    expect(profile.bottleneck?.cuConsumed).toBe(150000); // <-- CORRIGIDO
    expect(profile.bottleneck?.programName).toBe("Unknown Program"); // <-- ALTERADO PARA programName
  });

  it('should handle multiple instructions and calculate totals correctly', () => {
    const profile = profileCU(cuMultipleInstructionsLogs);

    expect(profile.totalConsumed).toBe(80000);
    expect(profile.totalLimit).toBe(800000);
    expect(profile.utilizationPercent).toBeCloseTo((80000 / 800000) * 100);
    expect(profile.perInstruction.length).toBe(4);
    expect(profile.bottleneck?.cuConsumed).toBe(40000); // <-- CORRIGIDO
  });

  it('should return default values for empty log messages', () => {
    const profile = profileCU([]);

    expect(profile.totalConsumed).toBe(0);
    expect(profile.totalLimit).toBe(0);
    expect(profile.utilizationPercent).toBe(0);
    expect(profile.perInstruction.length).toBe(0);
    expect(profile.bottleneck?.cuConsumed).toBe(0); 
  });
});