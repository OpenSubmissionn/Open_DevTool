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
export * from './analysis/renderer';
export * from './solana/rpc';
export * from './solana/connection';

// MCP Integration
export * from './mcp/client';
export * from './mcp/mcpInsightProvider';
