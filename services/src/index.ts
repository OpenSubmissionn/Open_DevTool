export * from './analysis/types';
export {
  getProgramName,
  getProgramInfo,
  isProgramKnown,
  getProgramsByCategory,
} from './solana/programs';

export * from './analysis/accountDiff';
export * from './analysis/txParser';
export { ParsedLogs as ParsedLogsFromLogParser, parseLogsFromBundle } from './analysis/logParser';
export * from './analysis/cuProfiler';
export * from './analysis/cpiTreeBuilder';
export * from './solana/idlcache';
export type { IdlCacheOptions, FetchResult } from './solana/idlcache';
export * from './analysis/merger';
export { analyzeTransaction, mergeInsights } from './analysis/insightEngine';
export { detectAnomalies } from './analysis/anomalyDetector';
export type {
  Anomaly,
  AnomalyType,
  AnomalySeverity,
  AnomalyReport,
} from './analysis/anomalyDetector';
export * from './analysis/renderer';
export * from './solana/rpc';
export * from './solana/connection';
export * from './solana/simulationService';

// Batch analysis
export * from './analysis/batchAggregator';

// MCP Integration
export * from './mcp/client';
export * from './mcp/mcpInsightProvider';
