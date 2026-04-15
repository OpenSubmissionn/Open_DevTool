import { describe, it, expect } from 'vitest';
import { fetchTransaction } from './rpc';
import txSuccess from '../../tests/fixtures/txSuccess.json';
import txFailed from '../../tests/fixtures/txFailed.json';

describe('RPC Fetcher', () => {
  
  it('should correctly structure data from the success fixture', () => {
    const tx = txSuccess as any;
    
    const logs = tx.meta?.logMessages || [];
    const cu = tx.meta?.computeUnitsConsumed;

    console.log(`Success Fixture - Logs: ${logs.length}, CU: ${cu}`);
    
    expect(logs).toBeInstanceOf(Array);
    expect(tx.slot).toBeGreaterThan(0);
  });

  it('should correctly structure data from the failed fixture', () => {
    const tx = txFailed as any;
    
    const logs = tx.meta?.logMessages || [];
    const cu = tx.meta?.computeUnitsConsumed;
    const error = tx.meta?.err;

    console.log(`Failed Fixture - Logs: ${logs.length}, CU: ${cu}, Error: ${JSON.stringify(error)}`);
    
    expect(error).not.toBeNull();
    expect(cu).toBeDefined();
  });

  it('should throw error for an invalid signature on Devnet', { timeout: 10000 }, async () => {
    const INVALID_SIG = 'invalidSignature1234567890abcdefghij';
    await expect(fetchTransaction(INVALID_SIG)).rejects.toThrow('failed to get transaction: Invalid pa'); // <-- MENSAGEM DE ERRO AJUSTADA
  });
});
