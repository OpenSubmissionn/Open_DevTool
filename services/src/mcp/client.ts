export interface MCPPayload {
  bottleneckProgram: string;
  instructionName: string;
  cuConsumed: number;
  cpiDepth: number;
  accountDiffSummary: string;
  parsedErrors: string[];
  logSummary: string;
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

      const data = (await response.json()) as { suggestions?: string[] };
      return { suggestions: data.suggestions ?? [], source: 'mcp' };
    } catch (error) {
      clearTimeout(timeoutId);

      if (retryCount < 1) {
        // Retry on network failure
        return attempt(retryCount + 1);
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[MCP] Degraded: ${errorMsg}`);
      return { suggestions: [], source: 'mcp' };
    }
  };

  return attempt(0);
}
