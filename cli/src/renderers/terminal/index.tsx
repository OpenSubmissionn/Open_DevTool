import React from 'react';
import { Box, Text } from 'ink';
import { AnalyzedTransaction, InsightReport } from '../../../../services/src';

/**
 * Utility to truncate long strings.
 * Prevents the layout from breaking in smaller terminals.
 */
const truncate = (str: string, start = 8, end = 8) => {
  if (!str) return 'N/A';
  if (str.length <= start + end) return str;
  return `${str.slice(0, start)}...${str.slice(-end)}`;
};

/**
 * 1. HEADER COMPONENT
 * Focused on technical clarity and fee data from Task 2.3.
 */
const Header = ({ signature, success, slot, fee, network }: { signature: string, success: boolean, slot: number, fee?: number, network: 'mainnet' | 'devnet' }) => {
  const statusColor = success ? 'green' : 'red';
  const displayFee = fee !== undefined ? (fee / 1e9).toFixed(6) : 'N/A';
  const networkLabel = network.toUpperCase();

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Top Bar */}
      <Box justifyContent="space-between">
        <Text color="cyan" bold>OPEN INSIGHT [CLI v0.1.0]</Text>
        <Box>
          <Text backgroundColor="blue" color="white"> {networkLabel} </Text>
          <Text backgroundColor="gray" color="white"> SLOT: {slot || 'N/A'} </Text>
        </Box>
      </Box>

      {/* Main Status Box */}
      <Box borderStyle="round" borderColor={statusColor} paddingX={1} flexDirection="column">
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
 * 2. MAIN COMPONENT (GRID SYSTEM)
 * Organizes the screen and prepares the layout for upcoming tasks.
 */
export const TerminalRenderer: React.FC<{ 
  analyzed: AnalyzedTransaction; 
  insights: InsightReport; 
  network?: 'mainnet' | 'devnet';
}> = ({ analyzed, insights, network = 'devnet' }) => {
  const signature = analyzed.signature || analyzed.raw?.signature || analyzed.parsed?.signature || 'N/A';
  const slot = (analyzed as any).slot || (analyzed as any).parsed?.slot || analyzed.raw?.slot || 0;
  const fee = (analyzed as any).fee || (analyzed as any).feeLamports || (analyzed as any).parsed?.fee;

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} minWidth={80}>
      
      {/* TOP SECTION: HEADER */}
      <Header 
        signature={signature} 
        success={analyzed.success} 
        /* * Safely accessing slot and fee. 
         * Using 'as any' to bypass TypeScript strict interface checks 
         * in case these properties are nested or missing in the current type definition.
         */
        slot={slot}
        fee={fee}
        network={network}
      />

      {/* MIDDLE SECTION: DATA DISPLAY */}
      <Box flexDirection="column" marginY={1}>
        {/* Placeholder for CPI Tree (Task 3.3) */}
        <Box borderStyle="single" borderColor="gray" paddingX={1} marginBottom={1}>
          <Text color="gray" italic>
            [ CPI TREE VIEW - PENDING TASK 3.3 ]
          </Text>
        </Box>

        {/* Placeholder for Account Diffs (Task 3.4) */}
        <Box paddingX={1}>
          <Text color="gray" italic>
            [ ACCOUNT CHANGES TABLE - PENDING TASK 3.4 ]
          </Text>
        </Box>
      </Box>

      {/* BOTTOM SECTION: ACTIONABLE INSIGHTS */}
      <Box borderStyle="double" borderColor="yellow" paddingX={1} flexDirection="column">
        <Text color="yellow" bold>ACTIONABLE INSIGHTS</Text>
        <Box flexDirection="column" marginTop={1}>
          {insights?.insights?.length > 0 ? (
            /* * Added explicitly ': any' to 'item' and 'index' to avoid TS errors.
             * Also handling 'item' in case it is an object (rendering item.message) 
             * or a simple string.
             */
            insights.insights.map((item: any, index: number) => {
              const insightText = typeof item === 'string' ? item : (item.message || JSON.stringify(item));
              return (
                <Text key={index}>
                  <Text color="yellow"> - </Text>{insightText}
                </Text>
              );
            })
          ) : (
            <Text color="gray"> No optimization issues detected.</Text>
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