import React from 'react';
import { Box, Text } from 'ink';

/**
 * 1. Data structure definition for a tree node.
 * Represents a single program execution within the transaction.
 */
export interface CPINode {
  programId: string;
  programName: string;
  status: 'success' | 'failed';
  cuConsumed: number;
  children: CPINode[];
}

interface CPITreeProps {
  tree: {
    root: CPINode[];
    totalDepth: number;
    nodeCount: number;
  };
}

/**
 * 2. Recursive component that renders a SINGLE tree line.
 * It handles the visual connectors (branches) and calls itself for children.
 */
const TreeNode: React.FC<{ node: CPINode; isLast: boolean; prefix: string }> = ({ node, isLast, prefix }) => {
  // Box-drawing characters for tree visualization
  const connector = isLast ? '└── ' : '├── ';
  
  // If this is the last item, the next level should have empty space; 
  // otherwise, keep the vertical pipe for siblings below.
  const childPrefix = prefix + (isLast ? '    ' : '│   ');

  const statusColor = node.status === 'success' ? 'green' : 'red';

  return (
    <Box flexDirection="column">
      {/* Current Execution Line */}
      <Box>
        <Text color="gray">{prefix}{connector}</Text>
        <Text color={statusColor}>{node.status === 'success' ? '✓ ' : '✗ '}</Text>
        <Text bold color="white">{node.programName} </Text>
        <Text color="gray">({node.cuConsumed.toLocaleString()} CU)</Text>
      </Box>

      {/* Children Rendering (Recursion) */}
      {node.children && node.children.map((child, index) => (
        <TreeNode 
          key={index} 
          node={child} 
          isLast={index === node.children.length - 1} 
          prefix={childPrefix} 
        />
      ))}
    </Box>
  );
};

/**
 * 3. Main Exported Component
 * Wraps the tree in a styled box for the terminal output.
 */
export const CPITreeView: React.FC<CPITreeProps> = ({ tree }) => {
  // Safety check for empty or missing data
  if (!tree || !tree.root || tree.root.length === 0) {
    return <Text color="gray" italic> [ No CPI data available ]</Text>;
  }

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="cyan" bold>CPI CALL TREE</Text>
      </Box>
      
      {/* Start rendering from the root nodes */}
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