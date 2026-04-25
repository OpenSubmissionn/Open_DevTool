import { describe, it, expect } from 'vitest';
import { compareFrameworks } from '../../src/analysis/frameworkComparator';
import { ParsedInstruction } from '../../src/analysis/types';

describe('Framework Comparator', () => {
  it('should suggest a more efficient native alternative for a high-CU Anchor instruction', () => {
    // Mock a parsed instruction that represents an expensive "transfer"
    // operation done with a framework we'll pretend is Anchor.
    const mockAnchorInstruction: ParsedInstruction = {
      programId: 'someprogram11111111111111111111111111111111', // A mock program ID
      name: 'transfer',
      cuConsumed: 2000, // Higher than the native baseline
      data: '02000000c800000000000000', // Mock data
      accounts: [],
      innerInstructions: [],
    };

    // Define a simple mock function for this test
    const mockDetectFramework = (programId: string) => {
      if (programId === 'someprogram11111111111111111111111111111111') {
        return 'Anchor';
      }
      return 'Unknown';
    };

    // Pass the mock function directly as an argument
    const result = compareFrameworks(mockAnchorInstruction, mockDetectFramework);

    // --- Assertions ---
    expect(result).not.toBeNull();

    if (!result) {
      throw new Error('Test failed: result is null');
    }

    expect(result.operation).toBe('transfer');
    expect(result.currentFramework).toBe('Anchor');
    expect(result.currentCU).toBe(2000);
    expect(result.alternatives).toHaveLength(1);

    const nativeAlternative = result.alternatives[0];
    expect(nativeAlternative.framework).toBe('Native');
    expect(nativeAlternative.estimatedCU).toBe(500);
    expect(nativeAlternative.savings).toBe(1500); // 2000 (current) - 500 (native)
    expect(nativeAlternative.confidence).toBe('high');
  });

  it('should return null when no alternatives are found', () => {
    const mockInstruction: ParsedInstruction = {
      programId: 'someprogram11111111111111111111111111111111',
      name: 'some-unknown-operation',
      cuConsumed: 10000,
      data: '',
      accounts: [],
      innerInstructions: [],
    };

    const result = compareFrameworks(mockInstruction);
    expect(result).toBeNull();
  });
});
