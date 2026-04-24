import { InsightProvider, InsightContext, ProviderInsight } from '../analysis/types';
import { requestInsights, MCPPayload } from './client';

/**
 * Builds the payload for MCP insight requests from transaction context.
 */
function buildMcpPayload(context: InsightContext): MCPPayload {
  const tx = context.transaction;
  const bottleneck = tx.cuProfile.bottleneck;

  // Build account diff summary
  const accountDiffSummary = tx.accountDiffs
    .map(diff => `${diff.pubkey.slice(0, 8)}...: ${diff.solDelta > 0 ? '+' : ''}${diff.solDelta} SOL`)
    .join(', ');

  // Extract errors from logs
  const parsedErrors = tx.logs.entries
    ?.filter(entry => entry.type === 'failed')
    .map(entry => entry.message || 'Unknown error') || [];

  // Build log summary
  const logSummary = `${tx.logs.entries?.length || 0} log entries, ${parsedErrors.length} errors`;

  return {
    bottleneckProgram: bottleneck?.programName || 'Unknown',
    instructionName: bottleneck ? `${bottleneck.programName} instruction` : 'Unknown instruction',
    cuConsumed: tx.cuProfile.totalConsumed,
    cpiDepth: tx.cpiTree.totalDepth,
    accountDiffSummary: accountDiffSummary || 'No account changes',
    parsedErrors,
    logSummary
  };
}

/**
 * MCP-based insight provider that uses external AI to generate optimization suggestions.
 */
export class McpInsightProvider implements InsightProvider {
  async fetchInsights(context: InsightContext): Promise<ProviderInsight[]> {
    try {
      const payload = buildMcpPayload(context);
      const response = await requestInsights(payload);

      // Convert MCP suggestions to ProviderInsights
      return response.suggestions.map((suggestion: string): ProviderInsight => {
        return {
          insight: {
            type: 'MCP_SUGGESTION',
            severity: 'info' as const,
            title: 'AI Optimization Suggestion',
            message: suggestion,
            recommendation: suggestion,
            source: 'mcp',
            codeSuggestions: []
          },
          source: 'mcp'
        };
      });
    } catch (error) {
      console.warn('[MCP Provider] Failed to fetch insights:', error);
      return [];
    }
  }
}