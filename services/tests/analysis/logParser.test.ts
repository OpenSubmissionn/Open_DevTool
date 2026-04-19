// services/tests/analysis/logParser.test.ts

import { describe, it, expect } from 'vitest';
import { parseLogsFromBundle } from '../../src/analysis/logParser';

describe('Log Parser Engine (Task 1.3.1)', () => {
  
  it('should correctly parse standard execution logs and CU consumption', () => {
    const mockLogs = [
      'Program 11111111111111111111111111111111 invoke [1]',
      'Program log: Instruction: Transfer',
      'Program 11111111111111111111111111111111 consumed 150 of 200000 compute units',
      'Program 11111111111111111111111111111111 success'
    ];

    const result = parseLogsFromBundle(mockLogs);
    
    expect(result.totalLines).toBe(4);
    expect(result.errors).toHaveLength(0);
    
    expect(result.byProgram['11111111111111111111111111111111']).toBeDefined();
    expect(result.byProgram['11111111111111111111111111111111'].consumed).toBe(150);
    expect(result.byProgram['11111111111111111111111111111111'].limit).toBe(200000);
    expect(result.byProgram['11111111111111111111111111111111'].invocations).toBe(1);
  });

  it('should properly track Cross-Program Invocations (CPI)', () => {
    const mockLogs = [
      'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA invoke [1]',
      'Program log: Instruction: InitializeMint',
      'Program 11111111111111111111111111111111 invoke [2]',
      'Program 11111111111111111111111111111111 consumed 100 of 200000 compute units',
      'Program 11111111111111111111111111111111 success',
      'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA consumed 3000 of 200000 compute units',
      'Program TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA success'
    ];

    const result = parseLogsFromBundle(mockLogs);
    
    expect(result.totalLines).toBe(7);
    
    expect(result.byProgram['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'].invocations).toBe(1);
    expect(result.byProgram['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'].consumed).toBe(3000);
    expect(result.byProgram['11111111111111111111111111111111'].invocations).toBe(1);
    expect(result.byProgram['11111111111111111111111111111111'].consumed).toBe(100);
  });

  it('should accurately capture explicit failures and internal errors', () => {
    const mockLogs = [
      'Program Vote111111111111111111111111111111111111111 invoke [1]',
      'Program log: Error: custom program error: 0x1',
      'Program Vote111111111111111111111111111111111111111 consumed 450 of 200000 compute units',
      'Program Vote111111111111111111111111111111111111111 failed: custom program error: 0x1'
    ];

    const result = parseLogsFromBundle(mockLogs);
    
    expect(result.errors.length).toBe(2);
    expect(result.errors).toContain('Error: custom program error: 0x1');
    expect(result.errors).toContain('Program Vote111111111111111111111111111111111111111 failed: custom program error: 0x1');
    expect(result.byProgram['Vote111111111111111111111111111111111111111'].consumed).toBe(450);
  });

});