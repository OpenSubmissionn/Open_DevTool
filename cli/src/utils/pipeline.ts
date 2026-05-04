// Shared pipeline helpers used by the tx and batch commands.
import { buildCPITree, parseLogsFromBundle, type CPITree, type ParsedLogs } from '@open/services';

export function toCPITree(trace: ReturnType<typeof buildCPITree>): CPITree {
  const toNode = (node: (typeof trace.roots)[number]): CPITree['root'][number] => ({
    programId: node.programId,
    programName: node.programId,
    depth: node.depth,
    status: node.status === 'success' ? 'success' : 'failed',
    cuConsumed: node.computeUnitsConsumed,
    children: node.children.map(toNode),
  });

  const visit = (
    node: (typeof trace.roots)[number],
    acc: { maxDepth: number; count: number }
  ): void => {
    acc.maxDepth = Math.max(acc.maxDepth, node.depth);
    acc.count += 1;
    for (const child of node.children) visit(child, acc);
  };

  const metrics = { maxDepth: 0, count: 0 };
  for (const root of trace.roots) visit(root, metrics);

  return {
    root: trace.roots.map(toNode),
    totalDepth: metrics.maxDepth,
    nodeCount: metrics.count,
  };
}

export function toParsedLogs(
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
