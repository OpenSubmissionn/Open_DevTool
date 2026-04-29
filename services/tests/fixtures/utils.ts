import fs from 'fs';
import path from 'path';
import {
  parseLogsFromBundle,
  profileCU,
  buildCPITree,
  computeAccountDiffs,
  mergeAnalysis,
  analyzeTransaction,
  type AnalyzedTransaction,
  type CPITree,
  type ParsedLogs,
  type RawTransactionBundle,
  type InsightReport,
} from '../../src';

export function getFixture<T = RawTransactionBundle>(name: string): T {
  const base = path.join(__dirname, name + '.json');
  if (!fs.existsSync(base)) throw new Error(`Fixture not found: ${base}`);
  return JSON.parse(fs.readFileSync(base, 'utf-8')) as T;
}

function toCPITree(trace: ReturnType<typeof buildCPITree>): CPITree {
  const toNode = (node: (typeof trace.roots)[number]): CPITree['root'][number] => ({
    programId: node.programId,
    programName: node.programId,
    depth: node.depth,
    status: node.status === 'success' ? 'success' : 'failed',
    cuConsumed: node.computeUnitsConsumed,
    children: node.children.map(toNode),
  });

  let maxDepth = 0;
  let count = 0;
  const visit = (node: (typeof trace.roots)[number]) => {
    maxDepth = Math.max(maxDepth, node.depth);
    count += 1;
    node.children.forEach(visit);
  };
  trace.roots.forEach(visit);

  return {
    root: trace.roots.map(toNode),
    totalDepth: maxDepth,
    nodeCount: count,
  };
}

function toParsedLogs(
  logMessages: string[],
  parsed: ReturnType<typeof parseLogsFromBundle>
): ParsedLogs {
  return {
    raw: logMessages,
    entries: [],
    byProgram: Object.keys(parsed.byProgram).map((programId) => ({
      programId,
      programName: programId,
      entries: [],
      cuConsumed: parsed.byProgram[programId]?.consumed,
    })),
    errors: parsed.errors,
    totalLines: parsed.totalLines,
  };
}

/**
 * Loads a raw transaction fixture and runs the full analysis pipeline,
 * returning the shape that `renderTerminal` consumes.
 *
 * Provider is left undefined → no MCP call → deterministic output.
 */
export async function runPipeline(
  bundle: RawTransactionBundle
): Promise<{ analyzed: AnalyzedTransaction; insights: InsightReport }> {
  const logs = parseLogsFromBundle(bundle.logMessages);
  const cuProfile = profileCU(bundle.logMessages);
  const cpiTree = toCPITree(buildCPITree(bundle.logMessages));
  const accountDiffs = computeAccountDiffs(bundle);

  const analyzed = await mergeAnalysis(
    bundle,
    toParsedLogs(bundle.logMessages, logs),
    cuProfile,
    cpiTree,
    accountDiffs,
    {}
  );

  const insights = await analyzeTransaction(analyzed);
  return { analyzed, insights };
}

/** Convenience: load fixture by name and run pipeline. */
export async function loadAnalyzed(name: string) {
  const bundle = getFixture<RawTransactionBundle>(name);
  return runPipeline(bundle);
}
