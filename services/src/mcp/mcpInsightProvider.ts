import { InsightProvider, InsightContext, ProviderInsight } from '../analysis/types';
import type { AccountDiff, CPINode, CPITree } from '../analysis/types';
import { detectFramework } from '../analysis/frameworkComparator';
import {
  requestInsights,
  MCPPayload,
  CpiTreeStructure,
  BottleneckNodeDetail,
  DetailedAccountDiff,
  SimilarPattern,
} from './client';
import { buildPromptContext } from './prompts';

/**
 * Known optimization patterns indexed by program name.
 */
const KNOWN_PATTERNS: Record<string, SimilarPattern> = {
  'Jupiter V6': {
    programName: 'Jupiter V6',
    pattern: 'Aggregator swap with token program CPIs',
    optimization:
      'Use exact_in mode and prefer routes with fewer hops to reduce CU and slippage',
  },
  'Jupiter Aggregator': {
    programName: 'Jupiter Aggregator',
    pattern: 'Multi-DEX swap routing',
    optimization: 'Limit max hops to 2-3 to bound CU; cache route quotes when possible',
  },
  'Token Program': {
    programName: 'Token Program',
    pattern: 'Standard SPL token operation',
    optimization:
      'Use Associated Token Accounts to avoid manual account creation overhead',
  },
  'Raydium AMM v4': {
    programName: 'Raydium AMM v4',
    pattern: 'Constant-product AMM swap',
    optimization:
      'Pre-validate pool state to avoid mid-tx failures; cache pool keys across calls',
  },
  Whirlpool: {
    programName: 'Whirlpool',
    pattern: 'Concentrated liquidity swap',
    optimization:
      'Account for tick boundaries; query price range before swapping to set slippage',
  },
  'Magic Eden': {
    programName: 'Magic Eden',
    pattern: 'NFT marketplace operation',
    optimization:
      'Bundle list/buy in a single transaction when possible to reduce slot-level race exposure',
  },
  Marinade: {
    programName: 'Marinade',
    pattern: 'Liquid staking deposit/withdraw',
    optimization:
      'Choose direct unstake vs delayed unstake based on liquidity needs and fee tolerance',
  },
};

function findSimilarPatterns(programName: string | undefined): SimilarPattern[] {
  if (!programName || programName === 'Unknown') return [];

  const exact = KNOWN_PATTERNS[programName];
  if (exact) return [exact];

  const lower = programName.toLowerCase();
  const matches = Object.values(KNOWN_PATTERNS).filter((p) => {
    const known = p.programName.toLowerCase();
    return lower.includes(known) || known.includes(lower);
  });

  return matches.slice(0, 3);
}

function summarizeCpiTree(cpiTree: CPITree): CpiTreeStructure {
  const programs = new Set<string>();
  let nonLeafCount = 0;
  let totalChildren = 0;

  const visit = (node: CPINode): void => {
    programs.add(node.programId);
    if (node.children && node.children.length > 0) {
      nonLeafCount += 1;
      totalChildren += node.children.length;
      for (const child of node.children) visit(child);
    }
  };

  for (const root of cpiTree.root ?? []) visit(root);

  const branchingFactor = nonLeafCount === 0 ? 0 : totalChildren / nonLeafCount;

  return {
    depth: cpiTree.totalDepth ?? 0,
    totalNodes: cpiTree.nodeCount ?? 0,
    branchingFactor: Number(branchingFactor.toFixed(2)),
    uniquePrograms: programs.size,
  };
}

function extractBottleneckDetail(
  bottleneck:
    | {
        programId: string;
        programName: string;
        cuConsumed: number;
        utilizationPercent: number;
        status?: 'success' | 'failed';
        depth?: number;
      }
    | null
    | undefined
): BottleneckNodeDetail | undefined {
  if (!bottleneck) return undefined;

  return {
    programId: bottleneck.programId,
    programName: bottleneck.programName,
    cuConsumed: bottleneck.cuConsumed,
    utilizationPercent: bottleneck.utilizationPercent,
    status: bottleneck.status,
    depth: bottleneck.depth,
  };
}

function buildDetailedAccountDiffs(diffs: AccountDiff[]): DetailedAccountDiff[] {
  return diffs.map((diff) => ({
    pubkey: diff.pubkey,
    pubkeyShort: diff.pubkey.slice(0, 8),
    role: diff.role,
    solDelta: diff.solDelta,
    tokenDeltas: (diff.tokenDeltas ?? []).map((td) => ({
      mint: td.mint,
      symbol: td.symbol,
      uiDelta: td.uiDelta,
    })),
  }));
}

/**
 * Builds the payload for MCP insight requests from transaction context.
 */
function buildMcpPayload(context: InsightContext): MCPPayload {
  const tx = context.transaction;
  const bottleneck = tx.cuProfile.bottleneck;

  const accountDiffSummary = tx.accountDiffs
    .map(
      (diff) => `${diff.pubkey.slice(0, 8)}...: ${diff.solDelta > 0 ? '+' : ''}${diff.solDelta} SOL`
    )
    .join(', ');

  const parsedErrors =
    tx.logs.entries
      ?.filter((entry) => entry.type === 'failed')
      .map((entry) => entry.message || 'Unknown error') || [];

  const logSummary = `${tx.logs.entries?.length || 0} log entries, ${parsedErrors.length} errors`;

  // Enriched context (Task 2.5.1) — framework-detected prompt context
  const logMessages = tx.logs.entries?.map((entry) => entry.message ?? '') ?? [];
  const detected = detectFramework(logMessages);
  const promptContext = buildPromptContext({
    framework: detected.framework,
    cuConsumed: tx.cuProfile.totalConsumed,
  });

  // Enriched context (Task 2.7.1) — CPI tree + bottleneck + diffs + patterns
  const cpiTreeStructure = summarizeCpiTree(tx.cpiTree);
  const bottleneckNode = extractBottleneckDetail(bottleneck as never);
  const detailedAccountDiffs = buildDetailedAccountDiffs(tx.accountDiffs);
  const similarPatterns = findSimilarPatterns(bottleneck?.programName);

  return {
    bottleneckProgram: bottleneck?.programName || 'Unknown',
    instructionName: bottleneck ? `${bottleneck.programName} instruction` : 'Unknown instruction',
    cuConsumed: tx.cuProfile.totalConsumed,
    cpiDepth: tx.cpiTree.totalDepth,
    accountDiffSummary: accountDiffSummary || 'No account changes',
    parsedErrors,
    logSummary,
    promptContext,
    cpiTreeStructure,
    bottleneckNode,
    detailedAccountDiffs,
    similarPatterns,
  };
}

export class McpInsightProvider implements InsightProvider {
  async fetchInsights(context: InsightContext): Promise<ProviderInsight[]> {
    try {
      const payload = buildMcpPayload(context);
      const response = await requestInsights(payload);

      return response.suggestions.map((suggestion: string): ProviderInsight => {
        return {
          insight: {
            type: 'MCP_SUGGESTION',
            severity: 'info' as const,
            title: 'AI Optimization Suggestion',
            message: suggestion,
            recommendation: suggestion,
            source: 'mcp',
            codeSuggestions: [],
          },
          source: 'mcp',
        };
      });
    } catch (error) {
      console.warn('[MCP Provider] Failed to fetch insights:', error);
      return [];
    }
  }
}

// Exposed for unit tests so we can verify the wire shape without spinning up HTTP.
export const __test = { buildMcpPayload, summarizeCpiTree, findSimilarPatterns };