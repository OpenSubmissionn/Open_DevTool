import { describe, it, expect } from 'vitest';
import { mockRPCBundle } from '../setup';
import { detectAnomalies } from '../../src/analysis/anomalyDetector';

describe('anomalyDetector', () => {
  it('detects spam transfers with isSpamSuspect flag', () => {
    const bundle = mockRPCBundle();
    const transfers = [
      {
        from: 'aaa',
        to: 'bbb',
        amount: '999999999',
        token: 'UNKNOWN_MINT_XYZ',
        decimals: 6,
        uiAmount: 999999,
        usdValue: null,
        isSpamSuspect: true,
      },
    ];
    const report = detectAnomalies(bundle, transfers);
    expect(report.anomalies.some((a) => a.type === 'spam')).toBe(true);
    expect(report.hasHighSeverity).toBe(true);
  });

  it('detects MEV-like pattern with 3+ programs and swap keyword', () => {
    const bundle = mockRPCBundle({
      logMessages: [
        'Program AAA invoke [1]',
        'Program BBB invoke [2]',
        'Program log: swap executed',
        'Program CCC invoke [1]',
        'Program AAA success',
      ],
    });
    const report = detectAnomalies(bundle, []);
    expect(report.anomalies.some((a) => a.type === 'mev-like')).toBe(true);
  });

  it('detects nondeterministic failure pattern', () => {
    const bundle = mockRPCBundle({
      err: 'custom program error: 0x1',
      computeUnitsConsumed: 50000,
      logMessages: ['Program 11111111111111111111111111111111 invoke [1]', 'Program failed: error'],
    });
    const report = detectAnomalies(bundle, []);
    expect(report.anomalies.some((a) => a.type === 'nondeterministic')).toBe(true);
  });

  it('reports no anomalies for clean transaction', () => {
    const bundle = mockRPCBundle();
    const report = detectAnomalies(bundle, []);
    expect(report.anomalies.filter((a) => a.type === 'spam')).toHaveLength(0);
    expect(report.summary).toBe('No anomalies detected');
  });

  it('does not flag safe mint (USDC) as spam', () => {
    const transfers = [
      {
        from: 'aaa',
        to: 'bbb',
        amount: '5000000',
        token: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        decimals: 6,
        uiAmount: 5,
        usdValue: 5,
        isSpamSuspect: false,
      },
    ];
    const report = detectAnomalies(mockRPCBundle(), transfers);
    expect(report.anomalies.filter((a) => a.type === 'spam')).toHaveLength(0);
  });
});
