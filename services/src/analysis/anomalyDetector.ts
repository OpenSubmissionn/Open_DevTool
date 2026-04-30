import { RawTransactionBundle, TransferInfo } from './types';

export type AnomalyType = 'spam' | 'mev-like' | 'nondeterministic' | 'unknown';
export type AnomalySeverity = 'low' | 'medium' | 'high';

export interface Anomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  confidence: number; // 0 to 1
  details?: Record<string, unknown>;
}

export interface AnomalyReport {
  anomalies: Anomaly[];
  hasHighSeverity: boolean;
  summary: string;
}

export function detectAnomalies(
  bundle: RawTransactionBundle,
  transfers: TransferInfo[]
): AnomalyReport {
  const anomalies: Anomaly[] = [];

  try {
    // Rule 1 — Spam detection
    for (const transfer of transfers) {
      if (transfer.isSpamSuspect === true) {
        anomalies.push({
          type: 'spam',
          severity: 'high',
          confidence: 0.85,
          description: `Unverified token transfer with suspicious volume: ${transfer.uiAmount} ${transfer.token}`,
          details: {
            mint: transfer.token,
            uiAmount: transfer.uiAmount,
            from: transfer.from,
            to: transfer.to,
          },
        });
      }
    }

    // Rule 2 — MEV-like detection (sandwich heuristic)
    const logMessages = bundle.logMessages ?? [];
    const programIdRegex = /Program (\w+) invoke/;
    const uniquePrograms = new Set<string>();

    for (const log of logMessages) {
      const match = log.match(programIdRegex);
      if (match) {
        uniquePrograms.add(match[1]);
      }
    }

    const hasSwap = logMessages.some((l) => l.toLowerCase().includes('swap'));
    const hasInvoke1 = logMessages.some((l) => l.includes('invoke [1]'));
    const hasInvoke2 = logMessages.some((l) => l.includes('invoke [2]'));

    if (uniquePrograms.size >= 3 && hasSwap && hasInvoke1 && hasInvoke2) {
      anomalies.push({
        type: 'mev-like',
        severity: 'medium',
        confidence: 0.6,
        description:
          'Possible sandwich/MEV pattern detected: multiple program invocations around a swap',
        details: {
          programCount: uniquePrograms.size,
          hasNestedCalls: true,
        },
      });
    }

    // Rule 3 — Nondeterministic failure detection
    if (
      bundle.err !== null &&
      logMessages.some((l) => l.includes('failed') || l.includes('Error')) &&
      bundle.computeUnitsConsumed !== null &&
      bundle.computeUnitsConsumed > 0
    ) {
      anomalies.push({
        type: 'nondeterministic',
        severity: 'medium',
        confidence: 0.7,
        description:
          'Transaction failed after consuming compute units — possible nondeterministic behavior',
        details: {
          err: String(bundle.err),
          cuConsumed: bundle.computeUnitsConsumed,
        },
      });
    }
  } catch (err) {
    // Silently catch errors and return what we've detected so far
  }

  const hasHighSeverity = anomalies.some((a) => a.severity === 'high');
  const summary =
    anomalies.length === 0
      ? 'No anomalies detected'
      : anomalies.length === 1
        ? '1 anomaly detected'
        : `${anomalies.length} anomalies detected`;

  return {
    anomalies,
    hasHighSeverity,
    summary,
  };
}
