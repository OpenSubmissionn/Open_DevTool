import { AnalyzedTransaction, InsightReport } from '@open/services';

/**
 * CSV renderer (Task 4.2.1) — emits one row per transaction with the
 * fields specified in the Week 3 plan. Designed so multiple tx rows can
 * be concatenated under a single header (the `batch` command takes care
 * of suppressing repeated headers).
 *
 * Columns: txSignature, status, program, cu_consumed, fee_lamports,
 *          fee_sol, fee_usd, framework, insights_count, anomalies_count,
 *          highest_anomaly_severity, timestamp
 *
 * RFC 4180 quoting: any cell containing comma, quote, or newline is
 * wrapped in double quotes with internal quotes doubled.
 */

const CSV_COLUMNS = [
  'txSignature',
  'status',
  'program',
  'cu_consumed',
  'fee_lamports',
  'fee_sol',
  'fee_usd',
  'framework',
  'insights_count',
  'anomalies_count',
  'highest_anomaly_severity',
  'timestamp',
] as const;

const escapeCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
};

export function csvHeader(): string {
  return CSV_COLUMNS.join(',');
}

const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

function highestSeverity(anomalies: any[]): string {
  if (!anomalies || anomalies.length === 0) return '';
  let best = '';
  let bestRank = 0;
  for (const a of anomalies) {
    const rank = SEVERITY_RANK[a?.severity] ?? 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = a.severity;
    }
  }
  return best;
}

function pickPrimaryProgram(analyzed: AnalyzedTransaction): string {
  const bottleneck = (analyzed as any)?.cuProfile?.bottleneck?.programId;
  if (bottleneck) return bottleneck;
  const root = (analyzed as any)?.cpiTree?.root?.[0]?.programId;
  return root ?? '';
}

function pickFramework(analyzed: AnalyzedTransaction): string {
  return (
    (analyzed as any)?.frameworkComparison?.detected ?? (analyzed as any)?.parsed?.framework ?? ''
  );
}

export function csvRow(analyzed: AnalyzedTransaction, insights: InsightReport): string {
  const anomalies = (analyzed as any)?.anomalies?.anomalies ?? [];
  const insightsList = Array.isArray(insights) ? insights : ((insights as any)?.insights ?? []);

  const cells = [
    analyzed.signature ?? '',
    analyzed.success ? 'success' : 'failed',
    pickPrimaryProgram(analyzed),
    (analyzed as any)?.cuProfile?.totalConsumed ?? analyzed.cuCost?.cuConsumed ?? 0,
    analyzed.cuCost?.feeLamports ?? 0,
    analyzed.cuCost?.feeSOL ?? 0,
    analyzed.cuCost?.feeUSD ?? '',
    pickFramework(analyzed),
    insightsList.length,
    anomalies.length,
    highestSeverity(anomalies),
    new Date().toISOString(),
  ];

  return cells.map(escapeCell).join(',');
}

/** One-shot helper for `tx <sig> --csv` (header + single row). */
export function renderCSV(analyzed: AnalyzedTransaction, insights: InsightReport): string {
  return `${csvHeader()}\n${csvRow(analyzed, insights)}`;
}
