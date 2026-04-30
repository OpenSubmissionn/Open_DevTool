import { describe, it, expect } from 'vitest';
import { mockRPCBundle } from '../setup';
import { detectAnomalies } from '../../src/analysis/anomalyDetector';
import { analyzeCosts } from '../../src/analysis/costAnalyzer';
import { parseLogsFromBundle } from '../../src/analysis/logParser';
import { profileCU } from '../../src/analysis/cuProfiler';
import { parseTransaction } from '../../src/analysis/txParser';
import { classifyTransaction } from '../../src/analysis/classifier';
import { mergeAnalysis } from '../../src/analysis/merger';

describe('Stress test — edge cases and failure modes', () => {
  it('handles empty accounts array', () => {
    const bundle = mockRPCBundle({ accountKeys: [], preBalances: [], postBalances: [] });
    expect(() => detectAnomalies(bundle, [])).not.toThrow();
    expect(() => analyzeCosts(bundle, null, 0)).not.toThrow();
  });

  it('handles extremely nested CPI logs (15+ levels)', () => {
    const deepLogs = Array.from({ length: 15 }, (_, i) => `Program PROG${i} invoke [${i + 1}]`);
    const bundle = mockRPCBundle({ logMessages: deepLogs });
    expect(() => parseLogsFromBundle(bundle.logMessages)).not.toThrow();
    expect(() => profileCU(bundle.logMessages)).not.toThrow();
  });

  it('handles 20+ accounts without crash', () => {
    const manyKeys = Array.from({ length: 20 }, (_, i) => `Account${i}`);
    const bundle = mockRPCBundle({
      accountKeys: manyKeys,
      preBalances: new Array(20).fill(1000000),
      postBalances: new Array(20).fill(900000),
    });
    expect(() => analyzeCosts(bundle, 150, 1000)).not.toThrow();
  });

  it('handles unknown program gracefully', async () => {
    const bundle = mockRPCBundle({
      logMessages: ['Program UNKNOWNPROGRAM999 invoke [1]', 'Program UNKNOWNPROGRAM999 success'],
    });
    const parsed = await parseTransaction(bundle);
    expect(parsed.instructions).toBeDefined();
  });

  it('handles RPC timeout simulation (null data)', () => {
    const bundle = mockRPCBundle({
      computeUnitsConsumed: null,
      logMessages: [],
      preBalances: [],
      postBalances: [],
    });
    expect(() => analyzeCosts(bundle, null, 1000)).not.toThrow();
    const report = detectAnomalies(bundle, []);
    expect(report.summary).toBe('No anomalies detected');
  });

  it('handles IDL cache miss gracefully', async () => {
    const bundle = mockRPCBundle();
    const parsed = await parseTransaction(bundle, {});
    expect(parsed.signature).toBe('mockSignature123');
  });

  it('handles zero microLamportsPerCU', () => {
    const bundle = mockRPCBundle();
    const cost = analyzeCosts(bundle, 150, 0);
    expect(cost.cuCost.feeLamports).toBe(0);
    expect(cost.cuCost.feeSOL).toBe(0);
  });

  it('handles null solPriceUSD', () => {
    const bundle = mockRPCBundle();
    const cost = analyzeCosts(bundle, null, 1000);
    expect(cost.cuCost.feeUSD).toBeNull();
    expect(cost.totalTransferUSD).toBeNull();
  });

  it('classifier handles all tx types without crash', async () => {
    const bundles = [
      mockRPCBundle({ err: 'error' }),
      mockRPCBundle({ logMessages: ['Program whirlpool invoke [1]'] }),
      mockRPCBundle(),
    ];
    for (const bundle of bundles) {
      const parsed = await parseTransaction(bundle);
      expect(() => classifyTransaction(parsed)).not.toThrow();
    }
  });

  it('full pipeline produces consistent output shape', async () => {
    const bundle = mockRPCBundle();
    const logs = parseLogsFromBundle(bundle.logMessages);
    const cuProfile = profileCU(bundle.logMessages);
    const parsed = await parseTransaction(bundle);
    const costAnalysis = analyzeCosts(bundle, 150, 1000);
    const anomalyReport = detectAnomalies(bundle, costAnalysis.transfers);

    expect(logs).toHaveProperty('totalLines');
    expect(logs).toHaveProperty('byProgram');
    expect(cuProfile).toHaveProperty('totalConsumed');
    expect(parsed).toHaveProperty('signature');
    expect(costAnalysis).toHaveProperty('cuCost');
    expect(anomalyReport).toHaveProperty('anomalies');
    expect(anomalyReport).toHaveProperty('summary');
  });
});
