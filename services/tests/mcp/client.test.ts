import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestInsights, MCPPayload } from '../../src/mcp/client';

describe('MCP Client', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    delete process.env.MCP_ENDPOINT_URL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('successful response returns suggestions array', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: ['optimize loop', 'reduce allocations'] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    process.env.MCP_ENDPOINT_URL = 'http://localhost:3000/mcp';

    const payload: MCPPayload = {
      bottleneckProgram: 'pump',
      instructionName: 'swap',
      cuConsumed: 50000,
      cpiDepth: 2,
      accountDiffSummary: '5 accounts modified',
      parsedErrors: [],
      logSummary: '2 CPI calls',
    };

    const result = await requestInsights(payload);

    expect(result.suggestions).toEqual(['optimize loop', 'reduce allocations']);
    expect(result.source).toBe('mcp');
  });

  it('timeout returns empty suggestions without throwing', async () => {
    const mockFetch = vi.fn().mockRejectedValue(
      new Error('AbortError: The operation was aborted')
    );
    vi.stubGlobal('fetch', mockFetch);

    process.env.MCP_ENDPOINT_URL = 'http://localhost:3000/mcp';

    const payload: MCPPayload = {
      bottleneckProgram: 'pump',
      instructionName: 'swap',
      cuConsumed: 50000,
      cpiDepth: 2,
      accountDiffSummary: '5 accounts modified',
      parsedErrors: [],
      logSummary: '2 CPI calls',
    };

    const result = await requestInsights(payload);

    expect(result.suggestions).toEqual([]);
    expect(result.source).toBe('mcp');
  });

  it('5xx response retries once then returns empty suggestions', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 });

    vi.stubGlobal('fetch', mockFetch);

    process.env.MCP_ENDPOINT_URL = 'http://localhost:3000/mcp';

    const payload: MCPPayload = {
      bottleneckProgram: 'pump',
      instructionName: 'swap',
      cuConsumed: 50000,
      cpiDepth: 2,
      accountDiffSummary: '5 accounts modified',
      parsedErrors: [],
      logSummary: '2 CPI calls',
    };

    const result = await requestInsights(payload);

    expect(result.suggestions).toEqual([]);
    expect(result.source).toBe('mcp');
    expect(mockFetch).toHaveBeenCalledTimes(2); // Initial + 1 retry
  });

  it('MCP_ENDPOINT_URL not set returns empty suggestions without throwing', async () => {
    delete process.env.MCP_ENDPOINT_URL;

    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const payload: MCPPayload = {
      bottleneckProgram: 'pump',
      instructionName: 'swap',
      cuConsumed: 50000,
      cpiDepth: 2,
      accountDiffSummary: '5 accounts modified',
      parsedErrors: [],
      logSummary: '2 CPI calls',
    };

    const result = await requestInsights(payload);

    expect(result.suggestions).toEqual([]);
    expect(result.source).toBe('mcp');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
