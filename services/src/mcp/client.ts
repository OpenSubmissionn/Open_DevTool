/** Aggregate stats describing the CPI call tree shape. */
export interface CpiTreeStructure {
  /** Maximum depth of the CPI tree. */
  depth: number;
  /** Total number of nodes (root + children). */
  totalNodes: number;
  /** Average children per non-leaf node (1.0 means linear chain, >1.0 means fan-out). */
  branchingFactor: number;
  /** Count of distinct programs invoked across the tree. */
  uniquePrograms: number;
}

/** Detailed information about the program that consumed the most CU. */
export interface BottleneckNodeDetail {
  programId: string;
  programName: string;
  cuConsumed: number;
  utilizationPercent: number;
  /** Status of the bottleneck call ("success" | "failed"). */
  status?: 'success' | 'failed';
  /** Depth of the bottleneck node in the CPI tree, when known. */
  depth?: number;
}

/** Per-account state change with full role and value details. */
export interface DetailedAccountDiff {
  pubkey: string;
  /** First 8 chars of the pubkey for display. */
  pubkeyShort: string;
  /** Account role: signer / writable / readonly. */
  role: 'signer' | 'writable' | 'readonly';
  solDelta: number;
  /** Token deltas attached to this account (mint + uiDelta). */
  tokenDeltas: Array<{
    mint: string;
    symbol?: string;
    uiDelta: number;
  }>;
}

/** Reference to a known optimization pattern for the bottleneck program. */
export interface SimilarPattern {
  programName: string;
  pattern: string;
  optimization: string;
}

export interface MCPPayload {
  bottleneckProgram: string;
  instructionName: string;
  cuConsumed: number;
  cpiDepth: number;
  accountDiffSummary: string;
  parsedErrors: string[];
  logSummary: string;
  /** Aggregate metrics on the CPI tree shape. */
  cpiTreeStructure?: CpiTreeStructure;
  /** Detailed breakdown of the CU bottleneck node. */
  bottleneckNode?: BottleneckNodeDetail;
  /** Per-account state changes with role and token deltas. */
  detailedAccountDiffs?: DetailedAccountDiff[];
  /** Known optimization patterns relevant to this transaction's bottleneck. */
  similarPatterns?: SimilarPattern[];
}

export interface MCPInsightResponse {
  suggestions: string[];
  source: 'mcp';
}

export async function requestInsights(payload: MCPPayload): Promise<MCPInsightResponse> {
  const endpointUrl = process.env.MCP_ENDPOINT_URL;

  if (!endpointUrl) {
    console.warn('[MCP] Degraded: MCP_ENDPOINT_URL not set');
    return { suggestions: [], source: 'mcp' };
  }

  const attempt = async (retryCount: number): Promise<MCPInsightResponse> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status >= 500 && retryCount < 1) {
          // Retry on 5xx
          return attempt(retryCount + 1);
        }
        console.warn(`[MCP] Degraded: HTTP ${response.status}`);
        return { suggestions: [], source: 'mcp' };
      }

      const data = await response.json() as { suggestions?: string[] };
      return { suggestions: data.suggestions ?? [], source: 'mcp' };
    } catch (error) {
      clearTimeout(timeoutId);

      if (retryCount < 1) {
        // Retry on network failure
        return attempt(retryCount + 1);
      }

      const errorMsg =
        error instanceof Error
          ? error.message
          : String(error);
      console.warn(`[MCP] Degraded: ${errorMsg}`);
      return { suggestions: [], source: 'mcp' };
    }
  };

  return attempt(0);
}
