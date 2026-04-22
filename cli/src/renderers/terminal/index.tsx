import React from 'react';
import { Box, Text } from 'ink';
import { AnalyzedTransaction, InsightReport } from '../../../../services/src';
// 1. IMPORTING THE NEW COMPONENT (Task 3.3)
import { CPITreeView } from './CPITree'; 

/**
 * Utility to truncate long strings.
 * Prevents the layout from breaking in smaller terminal windows.
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
  // Convert Lamports to SOL for display
  const displayFee = fee !== undefined ? (fee / 1e9).toFixed(6) : 'N/A';
  const networkLabel = network.toUpperCase();

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Top Navigation Bar */}
      <Box justifyContent="space-between">
        <Text color="cyan" bold>OPEN INSIGHT [CLI v0.1.0]</Text>
        <Box>
          <Text backgroundColor="blue" color="white"> {networkLabel} </Text>
          <Text backgroundColor="gray" color="white"> SLOT: {slot || 'N/A'} </Text>
        </Box>
      </Box>

      {/* Main Status Container */}
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
 * Orchestrates the overall layout and integrates sub-components.
 */
export const TerminalRenderer: React.FC<{ 
  analyzed: AnalyzedTransaction; 
  insights: InsightReport; 
  network?: 'mainnet' | 'devnet';
}> = ({ analyzed, insights, network = 'devnet' }) => {
  // Safe property extraction from various potential data structures
  const signature = analyzed.signature || (analyzed as any).raw?.signature || (analyzed as any).parsed?.signature || 'N/A';
  const slot = (analyzed as any).slot || (analyzed as any).parsed?.slot || (analyzed as any).raw?.slot || 0;
  const fee = (analyzed as any).fee || (analyzed as any).feeLamports || (analyzed as any).parsed?.fee;

  // 2. MOCK DATA (Temporary data to validate Task 3.3 UI)
  const mockTree = {
    root: [{
      programName: "Jupiter Aggregator v6",
      programId: "JUP6LkbDno1S66P7U527K7w99mW96v6",
      status: "success" as const,
      cuConsumed: 45200,
      children: [
        { 
            programName: "Token Program", 
            programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", 
            status: "success" as const, 
            cuConsumed: 2500, 
            children: [] 
        },
        { 
          programName: "Raydium Swap", 
          programId: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", 
          status: "success" as const, 
          cuConsumed: 18000, 
          children: [
            { programName: "System Program", programId: "11111111111111111111111111111111", status: "success" as const, cuConsumed: 150, children: [] }
          ] 
        }
      ]
    }],
    totalDepth: 3,
    nodeCount: 4
  };

  /**
   * REFINED LOGIC: 
   * Priority: Real Data (if it has root nodes) > Mock Data (safety fallback)
   */
  const realTree = (analyzed as any).cpiTree;
  const cpiData = (realTree && realTree.root && realTree.root.length > 0) ? realTree : mockTree;

  /**
   * SAFE INSIGHTS:
   * Ensures we are mapping over an array regardless of data structure
   */
  const insightsList = Array.isArray(insights) ? insights : (insights as any)?.insights || [];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} minWidth={80}>
      
      {/* TOP SECTION: HEADER */}
      <Header 
        signature={signature} 
        success={analyzed.success} 
        slot={slot}
        fee={fee}
        network={network}
      />

      {/* MIDDLE SECTION: DATA DISPLAY */}
      <Box flexDirection="column" marginY={1}>
        
        {/* 3. CPI TREE INTEGRATION (Task 3.3) */}
        <CPITreeView tree={cpiData} />

        {/* Placeholder for Account Diffs (Task 3.4) */}
        <Box paddingX={1} marginTop={1}>
          <Text color="gray" italic>
            [ ACCOUNT CHANGES TABLE - PENDING TASK 3.4 ]
          </Text>
        </Box>
      </Box>

      {/* BOTTOM SECTION: ACTIONABLE INSIGHTS */}
      <Box borderStyle="double" borderColor="yellow" paddingX={1} flexDirection="column">
        <Text color="yellow" bold>ACTIONABLE INSIGHTS</Text>
        <Box flexDirection="column" marginTop={1}>
          {insightsList.length > 0 ? (
            insightsList.map((item: any, index: number) => {
              // Handle both string-based and object-based insights
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