import { describe, it, expect } from 'vitest';
import { mergeAnalysis } from '../../src/analysis/merger';
import { 
  RawTransactionBundle, 
  ParsedTransaction, 
  CUProfile, 
  CPITree, 
  ParsedLogs,
  AccountDiff 
} from '../../src/analysis/types';

describe('Analysis Merger', () => {
  it('should correctly assemble an AnalyzedTransaction object', () => {
    // Simplified mocks for testing purposes
    const mockRaw = { signature: '5ABC...', slot: 12345 } as unknown as RawTransactionBundle;
    const mockParsed = { signature: '5ABC...', success: true } as ParsedTransaction;
    const mockCU = { totalConsumed: 5000 } as CUProfile;
    const mockTree = { totalDepth: 2, nodeCount: 5 } as CPITree;
    
    // FIX: Added the mandatory 'role' property required by the AccountDiff interface
    const mockDiffs: AccountDiff[] = [
      { 
        pubkey: 'TokenAccount123', 
        solDelta: 0, 
        tokenDeltas: [],
        role: 'writable' // Must be 'signer', 'writable', or 'readonly'
      }
    ];

    const mockLogs = { totalLines: 15, byProgram: [] } as unknown as ParsedLogs;

    const result = mergeAnalysis(
      mockRaw,
      mockParsed,
      mockCU,
      mockTree,
      mockDiffs,
      mockLogs
    );

    // Assertions
    expect(result.raw.signature).toBe('5ABC...');
    expect(result.parsed.success).toBe(true);
    expect(result.cuProfile.totalConsumed).toBe(5000);
    expect(result.cpiTree.totalDepth).toBe(2);
    expect(result.accountDiffs).toHaveLength(1);
    expect(result.accountDiffs[0].role).toBe('writable'); // Extra verification for the fix
    expect(result.logs.totalLines).toBe(15);
  });
});
