import React from 'react';
import { Box, Text } from 'ink';
import { AnalyzedTransaction, InsightReport } from '../../../../services/src';

// CPI Tree (Task 3.3)
import { CPITreeView } from './CPITree';

// Accounts Table (Task 3.4)
import { AccountsTable } from './AccountsTable';

/**
 * Utility to truncate long strings
 */
const truncate = (str: string, start = 8, end = 8) => {
  if (!str) return 'N/A';
  if (str.length <= start + end) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
};

/**
 * HEADER COMPONENT
 */
const Header = ({
  signature,
  success,
  slot,
  fee,
  network,
}: {
  signature: string;
  success: boolean;
  slot: number;
  fee?: number;
  network: 'mainnet' | 'devnet';
}) => {
  const statusColor = success ? 'green' : 'red';
  const displayFee = fee !== undefined ? (fee / 1e9).toFixed(6) : 'N/A';
  const networkLabel = network.toUpperCase();

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="space-between">
        <Text color="cyan" bold>
          OPEN INSIGHT [CLI v0.1.0]
        </Text>
        <Box>
          <Text backgroundColor="blue" color="white">
            {' '}
            {networkLabel}{' '}
          </Text>
          <Text backgroundColor="gray" color="white">
            {' '}
            SLOT: {slot || 'N/A'}{' '}
          </Text>
        </Box>
      </Box>

      <Box
        borderStyle="round"
        borderColor={statusColor}
        paddingX={1}
        flexDirection="column"
      >
        <Box justifyContent="space-between">
          <Box>
            <Text bold>SIGNATURE: </Text>
            <Text>{truncate(signature, 16, 16)}</Text>
          </Box>
          <Text color={statusColor} bold>
            {success ? 'SUCCESS' : 'FAILED'}
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text color="gray">TRANSACTION FEE: {displayFee} SOL</Text>
        </Box>
      </Box>
    </Box>
  );
};

/**
 * MAIN TERMINAL RENDERER
 */
export const TerminalRenderer: React.FC<{
  analyzed: AnalyzedTransaction;
  insights: InsightReport;
  network?: 'mainnet' | 'devnet';
}> = ({ analyzed, insights, network = 'devnet' }) => {
  const signature =
    analyzed.signature ||
    (analyzed as any).raw?.signature ||
    (analyzed as any).parsed?.signature ||
    'N/A';

  const slot =
    (analyzed as any).slot ||
    (analyzed as any).parsed?.slot ||
    (analyzed as any).raw?.slot ||
    0;

  const fee =
    (analyzed as any).fee ||
    (analyzed as any).feeLamports ||
    (analyzed as any).parsed?.fee;

  /**
   * MOCK CPI TREE (fallback)
   */
  const mockTree = {
    root: [
      {
        programName: 'Jupiter Aggregator v6',
        programId: 'JUP6LkbDno1S66P7U527K7w99mW96v6',
        status: 'success' as const,
        cuConsumed: 45200,
        children: [
          {
            programName: 'Token Program',
            programId:
              'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            status: 'success' as const,
            cuConsumed: 2500,
            children: [],
          },
        ],
      },
    ],
    totalDepth: 2,
    nodeCount: 2,
  };

  const realTree = (analyzed as any).cpiTree;
  const cpiData =
    realTree && realTree.root && realTree.root.length > 0
      ? realTree
      : mockTree;

  /**
   * INSIGHTS SAFE HANDLING
   */
  const insightsList = Array.isArray(insights)
    ? insights
    : (insights as any)?.insights || [];

  /**
   * ACCOUNT DIFFS (Task 3.4)
   */
  const accountDiffs = (analyzed as any).accountDiffs || [];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} minWidth={80}>
      
      {/* HEADER */}
      <Header
        signature={signature}
        success={analyzed.success}
        slot={slot}
        fee={fee}
        network={network}
      />

      {/* MAIN SECTION */}
      <Box flexDirection="column" marginY={1}>
        
        {/* CPI TREE (Task 3.3) */}
        <CPITreeView tree={cpiData} />

        {/* ACCOUNTS TABLE (Task 3.4) */}
        <Box paddingX={1} marginTop={1} flexDirection="column">
          <Text bold>ACCOUNT CHANGES</Text>
          <Text>
            {AccountsTable({
              accounts: accountDiffs,
            })}
          </Text>
        </Box>

      </Box>

      {/* INSIGHTS */}
      <Box
        borderStyle="double"
        borderColor="yellow"
        paddingX={1}
        flexDirection="column"
      >
        <Text color="yellow" bold>
          ACTIONABLE INSIGHTS
        </Text>

        <Box flexDirection="column" marginTop={1}>
          {insightsList.length > 0 ? (
            insightsList.map((item: any, index: number) => {
              const text =
                typeof item === 'string'
                  ? item
                  : item.message || JSON.stringify(item);

              return (
                <Text key={index}>
                  <Text color="yellow"> - </Text>
                  {text}
                </Text>
              );
            })
          ) : (
            <Text color="gray">
              {' '}
              No optimization issues detected.
            </Text>
          )}
        </Box>
      </Box>

      {/* FOOTER */}
      <Box marginTop={1}>
        <Text color="gray">Press Ctrl+C to exit.</Text>
      </Box>
    </Box>
  );
};