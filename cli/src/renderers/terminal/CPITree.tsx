import React from 'react';
import { Box, Text } from 'ink';
import type {
  ExecutionTrace,
  ExecutionSnapshot,
} from '../../../../services/src/analysis/cpiTreeBuilder';

// ── Known program labels ───────────────────────────────────────────────────

const KNOWN_PROGRAMS: Record<string, string> = {
  ComputeBudget111111111111111111111111111111111: 'Compute Budget',
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: 'Token Program',
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: 'Assoc. Token Program',
  '11111111111111111111111111111111': 'System Program',
  metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s: 'Metaplex Metadata',
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: 'Jupiter Aggregator v6',
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: 'Orca Whirlpool',
};

function resolveName(programId: string): string {
  return KNOWN_PROGRAMS[programId] ?? programId;
}

// ── CU formatting ──────────────────────────────────────────────────────────

const CU_COL_WIDTH = 14;

function formatCU(cu: number | undefined): string {
  if (cu === undefined) return '—'.padStart(CU_COL_WIDTH);
  return `${(cu / 1000).toFixed(3)} CU`.padStart(CU_COL_WIDTH);
}

// ── TreeNode ───────────────────────────────────────────────────────────────

/**
 * parentLineage: one boolean per ancestor level above this node.
 *   true  → that ancestor still has siblings below it → draw │ guide line
 *   false → that ancestor was the last child          → draw blank space
 *
 * isLast: this node is the last sibling in its own group.
 */
const TreeNode: React.FC<{
  node: ExecutionSnapshot;
  isLast: boolean;
  parentLineage: boolean[];
}> = ({ node, isLast, parentLineage }) => {
  const depth = parentLineage.length;
  const children = node.children;

  const isFailed = node.status === 'failed';
  const isTruncated = node.status === 'truncated';
  const hasWarning = isFailed || isTruncated;

  const guide = parentLineage.map((more) => (more ? '│   ' : '    ')).join('');
  const connector = depth === 0 ? '' : isLast ? '└── ' : '├── ';

  // children inherit whether THIS node still has siblings below
  const childLineage: boolean[] = [...parentLineage, !isLast];

  const nameColor: string = isFailed ? 'yellow' : isTruncated ? 'gray' : 'white';

  return (
    <Box flexDirection="column">
      <Box>
        <Box flexGrow={1}>
          <Text color="gray">
            {guide}
            {connector}
          </Text>
          {hasWarning && <Text color="yellow">⚠ </Text>}
          <Text color={nameColor} bold={depth === 0}>
            {resolveName(node.programId)}
          </Text>
        </Box>
        <Text color="gray">{formatCU(node.computeUnitsConsumed)}</Text>
      </Box>

      {children.map((child, i) => (
        <TreeNode
          key={`${child.programId}-${child.depth}-${i}`}
          node={child}
          isLast={i === children.length - 1}
          parentLineage={childLineage}
        />
      ))}
    </Box>
  );
};

// ── CPITreeView ────────────────────────────────────────────────────────────

interface CPITreeViewProps {
  trace?: ExecutionTrace;
}

export const CPITreeView: React.FC<CPITreeViewProps> = ({ trace }) => {
  if (!trace || trace.roots.length === 0) {
    return (
      <Text color="gray" italic>
        [ No CPI data available ]
      </Text>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="gray" dimColor>
          CPI CALL TREE
        </Text>
      </Box>

      {trace.roots.map((root, i) => (
        <TreeNode
          key={`${root.programId}-${i}`}
          node={root}
          isLast={i === trace.roots.length - 1}
          parentLineage={[]}
        />
      ))}

      <Box marginTop={1} justifyContent="space-between">
        <Text color="gray" dimColor>
          total {(trace.totalComputeUnits / 1000).toFixed(3)} K CU
        </Text>
        {trace.isTruncated && <Text color="yellow">⚠ RPC log truncated</Text>}
      </Box>
    </Box>
  );
};
