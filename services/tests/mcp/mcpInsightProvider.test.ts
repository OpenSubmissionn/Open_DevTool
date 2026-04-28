import { describe, it, expect } from 'vitest';
import { __test } from '../../src/mcp/mcpInsightProvider';
import type { AnalyzedTransaction, CPITree, CPINode } from '../../src/analysis/types';

const { buildMcpPayload, summarizeCpiTree, findSimilarPatterns } = __test;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<CPINode> & { programId: string; programName: string }): CPINode {
  return {
    depth: 0,
    status: 'success',
    children: [],
    ...overrides,
  } as CPINode;
}

function makeContext(tx: Partial<AnalyzedTransaction>): { transaction: AnalyzedTransaction } {
  const base: Partial<AnalyzedTransaction> = {
    parsed: { success: true } as never,
    cuProfile: {
      totalConsumed: 0,
      totalLimit: 200_000,
      utilizationPercent: 0,
      perInstruction: [],
      bottleneck: null,
    } as never,
    cpiTree: { root: [], totalDepth: 0, nodeCount: 0 } as CPITree,
    accountDiffs: [],
    logs: { entries: [] } as never,
  };
  return { transaction: { ...base, ...tx } as AnalyzedTransaction };
}

// ─────────────────────────────────────────────────────────────────────────────
// summarizeCpiTree
// ─────────────────────────────────────────────────────────────────────────────

describe('summarizeCpiTree', () => {
  it('returns zeros for an empty tree', () => {
    const tree: CPITree = { root: [], totalDepth: 0, nodeCount: 0 };
    expect(summarizeCpiTree(tree)).toEqual({
      depth: 0,
      totalNodes: 0,
      branchingFactor: 0,
      uniquePrograms: 0,
    });
  });

  it('counts unique programs across nested nodes', () => {
    const tree: CPITree = {
      root: [
        makeNode({
          programId: 'JUP',
          programName: 'Jupiter V6',
          children: [
            makeNode({ programId: 'TOK', programName: 'Token Program' }),
            makeNode({ programId: 'TOK', programName: 'Token Program' }),
          ],
        }),
      ],
      totalDepth: 2,
      nodeCount: 3,
    };

    const result = summarizeCpiTree(tree);
    expect(result.uniquePrograms).toBe(2); // JUP and TOK
    expect(result.depth).toBe(2);
    expect(result.totalNodes).toBe(3);
  });

  it('computes branching factor as average children per non-leaf node', () => {
    // Root with 2 children, one child has 3 grandchildren → non-leaf=2, totalChildren=5 → 2.5
    const tree: CPITree = {
      root: [
        makeNode({
          programId: 'A',
          programName: 'A',
          children: [
            makeNode({
              programId: 'B',
              programName: 'B',
              children: [
                makeNode({ programId: 'C', programName: 'C' }),
                makeNode({ programId: 'D', programName: 'D' }),
                makeNode({ programId: 'E', programName: 'E' }),
              ],
            }),
            makeNode({ programId: 'F', programName: 'F' }),
          ],
        }),
      ],
      totalDepth: 3,
      nodeCount: 6,
    };

    expect(summarizeCpiTree(tree).branchingFactor).toBe(2.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// findSimilarPatterns
// ─────────────────────────────────────────────────────────────────────────────

describe('findSimilarPatterns', () => {
  it('returns the exact match when program name is a known pattern', () => {
    const result = findSimilarPatterns('Jupiter V6');
    expect(result.length).toBe(1);
    expect(result[0].programName).toBe('Jupiter V6');
    expect(result[0].optimization).toContain('exact_in');
  });

  it('returns substring matches for related names', () => {
    const result = findSimilarPatterns('Jupiter');
    expect(result.length).toBeGreaterThan(0);
    // Should match both Jupiter V6 and Jupiter Aggregator
    const names = result.map((p) => p.programName);
    expect(names.some((n) => n.includes('Jupiter'))).toBe(true);
  });

  it('returns empty array for unknown programs', () => {
    expect(findSimilarPatterns('SomeRandomProgram')).toEqual([]);
  });

  it('returns empty array for undefined or "Unknown" program', () => {
    expect(findSimilarPatterns(undefined)).toEqual([]);
    expect(findSimilarPatterns('Unknown')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildMcpPayload — verifies all enriched context fields are present
// ─────────────────────────────────────────────────────────────────────────────

describe('buildMcpPayload', () => {
  it('includes cpiTreeStructure derived from the tx CPI tree', () => {
    const ctx = makeContext({
      cpiTree: {
        root: [
          makeNode({
            programId: 'JUP',
            programName: 'Jupiter V6',
            children: [makeNode({ programId: 'TOK', programName: 'Token Program' })],
          }),
        ],
        totalDepth: 2,
        nodeCount: 2,
      } as CPITree,
    });

    const payload = buildMcpPayload(ctx);
    expect(payload.cpiTreeStructure).toBeDefined();
    expect(payload.cpiTreeStructure?.depth).toBe(2);
    expect(payload.cpiTreeStructure?.totalNodes).toBe(2);
    expect(payload.cpiTreeStructure?.uniquePrograms).toBe(2);
  });

  it('includes bottleneckNode details when bottleneck is present', () => {
    const ctx = makeContext({
      cuProfile: {
        totalConsumed: 100_000,
        totalLimit: 200_000,
        utilizationPercent: 50,
        perInstruction: [],
        bottleneck: {
          programId: 'JUP',
          programName: 'Jupiter V6',
          cuConsumed: 80_000,
          utilizationPercent: 80,
        } as never,
      } as never,
    });

    const payload = buildMcpPayload(ctx);
    expect(payload.bottleneckNode).toBeDefined();
    expect(payload.bottleneckNode?.programName).toBe('Jupiter V6');
    expect(payload.bottleneckNode?.cuConsumed).toBe(80_000);
    expect(payload.bottleneckNode?.utilizationPercent).toBe(80);
  });

  it('omits bottleneckNode when bottleneck is null', () => {
    const payload = buildMcpPayload(makeContext({}));
    expect(payload.bottleneckNode).toBeUndefined();
  });

  it('includes detailedAccountDiffs with role and token deltas', () => {
    const ctx = makeContext({
      accountDiffs: [
        {
          pubkey: 'AaaaaaaaaaaaaaaBBBB',
          role: 'signer',
          solDelta: -0.5,
          tokenDeltas: [
            { mint: 'USDCmint', symbol: 'USDC', decimals: 6, rawDelta: '1000000', uiDelta: 1 },
          ],
        },
      ],
    });

    const payload = buildMcpPayload(ctx);
    expect(payload.detailedAccountDiffs).toBeDefined();
    expect(payload.detailedAccountDiffs?.length).toBe(1);
    const diff = payload.detailedAccountDiffs![0];
    expect(diff.role).toBe('signer');
    expect(diff.solDelta).toBe(-0.5);
    expect(diff.pubkeyShort).toBe('Aaaaaaaa');
    expect(diff.tokenDeltas[0].symbol).toBe('USDC');
    expect(diff.tokenDeltas[0].uiDelta).toBe(1);
  });

  it('attaches similarPatterns matching the bottleneck program', () => {
    const ctx = makeContext({
      cuProfile: {
        totalConsumed: 100_000,
        totalLimit: 200_000,
        utilizationPercent: 50,
        perInstruction: [],
        bottleneck: {
          programId: 'JUP',
          programName: 'Jupiter V6',
          cuConsumed: 80_000,
          utilizationPercent: 80,
        } as never,
      } as never,
    });

    const payload = buildMcpPayload(ctx);
    expect(payload.similarPatterns).toBeDefined();
    expect(payload.similarPatterns!.length).toBeGreaterThan(0);
    expect(payload.similarPatterns![0].programName).toBe('Jupiter V6');
  });

  it('returns empty similarPatterns when bottleneck program is unknown', () => {
    const ctx = makeContext({
      cuProfile: {
        totalConsumed: 100_000,
        totalLimit: 200_000,
        utilizationPercent: 50,
        perInstruction: [],
        bottleneck: {
          programId: 'XYZ',
          programName: 'NeverHeardOfThis',
          cuConsumed: 80_000,
          utilizationPercent: 80,
        } as never,
      } as never,
    });

    const payload = buildMcpPayload(ctx);
    expect(payload.similarPatterns).toEqual([]);
  });

  it('keeps the original payload fields intact (backwards compatible)', () => {
    const payload = buildMcpPayload(makeContext({}));
    expect(payload).toHaveProperty('bottleneckProgram');
    expect(payload).toHaveProperty('instructionName');
    expect(payload).toHaveProperty('cuConsumed');
    expect(payload).toHaveProperty('cpiDepth');
    expect(payload).toHaveProperty('accountDiffSummary');
    expect(payload).toHaveProperty('parsedErrors');
    expect(payload).toHaveProperty('logSummary');
  });
});
