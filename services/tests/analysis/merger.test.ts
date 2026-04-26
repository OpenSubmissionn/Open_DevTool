import { describe, it, expect } from 'vitest';
import { mergeAnalysis } from '../../src/analysis/merger';
import { mockRPCBundle } from '../setup';

describe('mergeAnalysis', () => {
  it('should merge analysis into AnalyzedTransaction', async () => {
    const bundle = mockRPCBundle();
    const logs = { byProgram: {}, errors: [], totalLines: 4 };
    const cuProfile = { totalConsumed: 3000, totalLimit: 200000, utilizationPercent: 1.5, perInstruction: [], bottleneck: null };
    const cpiTree = { root: [], totalDepth: 0, nodeCount: 0 };
    const accountDiffs: any[] = [];

    const result = await mergeAnalysis(bundle, logs, cuProfile, cpiTree, accountDiffs);

    expect(result.raw.signature).toBe('mockSignature123');
    expect(result.cuProfile.totalConsumed).toBeGreaterThanOrEqual(0);
  });
});
