import React from 'react';
import { Box, Text } from 'ink';

/**
 * Data structure for a tree node.
 */
export interface CPINode {
  programId: string;
  programName: string;
  status: 'success' | 'failed';
  cuConsumed?: number; // made optional to reflect real data
  children?: CPINode[]; // also optional for safety
}

interface CPITreeProps {
  tree?: {
    root?: CPINode[];
    totalDepth?: number;
    nodeCount?: number;
  };
}

/**
 * Recursive component that renders a single node.
 */
const TreeNode: React.FC<{
  node: CPINode;
  isLast: boolean;
  prefix: string;
}> = ({ node, isLast, prefix }) => {
  const connector = isLast ? '└── ' : '├── ';
  const childPrefix = prefix + (isLast ? '    ' : '│   ');
  const statusColor = node.status === 'success' ? 'green' : 'red';

  // Safe CU formatting
  const cu = (node.cuConsumed ?? 0).toLocaleString();

  return (
    <Box flexDirection="column">
      {/* Current line */}
      <Box>
        <Text color="gray">{prefix}{connector}</Text>
        <Text color={statusColor}>
          {node.status === 'success' ? '✓ ' : '✗ '}
        </Text>
        <Text bold color="white">
          {node.programName || 'Unknown Program'}{' '}
        </Text>
        <Text color="gray">({cu} CU)</Text>
      </Box>

      {/* Children */}
      {node.children?.map((child, index) => (
        <TreeNode
          key={index}
          node={child}
          isLast={index === node.children!.length - 1}
          prefix={childPrefix}
        />
      ))}
    </Box>
  );
};

/**
 * Main component
 */
export const CPITreeView: React.FC<CPITreeProps> = ({ tree }) => {
  if (!tree?.root || tree.root.length === 0) {
    return <Text color="gray" italic>[ No CPI data available ]</Text>;
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text color="cyan" bold>
          CPI CALL TREE
        </Text>
      </Box>

      {tree.root.map((node, index) => (
        <TreeNode
          key={index}
          node={node}
          isLast={index === tree.root.length - 1}
          prefix=""
        />
      ))}
    </Box>
  );
};