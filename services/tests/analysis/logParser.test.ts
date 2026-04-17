import { describe, it, expect } from 'vitest';
import { parseLogsFromBundle } from '../../src/analysis/logParser';

describe('Log Parser (Task 1.3.1)', () => {
  
  it('should extract CU consumption correctly', () => {
    // Mocking Solana log lines
    const mockLogs = [
      'Program 11111111111111111111111111111111 invoke [1]',
      'Program 11111111111111111111111111111111 consumed 500 of 200000 compute units',
      'Program 11111111111111111111111111111111 success'
    ];

    const result = parseLogsFromBundle(mockLogs);
    
    // Assert total lines parsed matches the input
    expect(result.totalLines).toBe(3);
    
    // TODO: Add expects() to validate CU and Invoke extraction
  });

  it('should extract program messages', () => {
    const mockLogs = [
      'Program log: Hello Solana!'
    ];

    const result = parseLogsFromBundle(mockLogs);
    
    expect(result.totalLines).toBe(1);
    // TODO: Add expects() to validate message extraction
  });

});
