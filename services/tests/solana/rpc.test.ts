import { describe, it, expect, vi } from 'vitest';
import { fetchTransaction } from '../../src/solana/rpc';
import * as connectionModule from '../../src/solana/connection';
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

  it('should throw when the RPC returns no transaction', async () => {
    const getConnectionSpy = vi
      .spyOn(connectionModule, 'getConnection')
      .mockReturnValue({ getParsedTransaction: vi.fn() } as any);
    const withRetrySpy = vi
      .spyOn(connectionModule, 'withRetry')
      .mockResolvedValue(null as any);

    await expect(fetchTransaction('missingSignatureExample')).rejects.toThrow
    ('failed to get transaction: missingSignatureExample');

    expect(withRetrySpy).toHaveBeenCalled();
    getConnectionSpy.mockRestore();
    withRetrySpy.mockRestore();
  });

  it('should return default arrays when transaction metadata is missing', async () => {
    const getConnectionSpy = vi
      .spyOn(connectionModule, 'getConnection')
      .mockReturnValue({ getParsedTransaction: vi.fn() } as any);
    const withRetrySpy = vi
      .spyOn(connectionModule, 'withRetry')
      .mockResolvedValue({
        slot: 123,
        blockTime: null,
        meta: null,
        transaction: { message: { accountKeys: ['dummyKey'] } },
      } as any);

    const result = await fetchTransaction('missingMetaSignature');

    expect(result.logMessages).toEqual([]);
    expect(result.preBalances).toEqual([]);
    expect(result.postBalances).toEqual([]);
    expect(result.preTokenBalances).toEqual([]);
    expect(result.postTokenBalances).toEqual([]);
    expect(result.innerInstructions).toEqual([]);
    expect(result.accountKeys).toEqual(['dummyKey']);

    getConnectionSpy.mockRestore();
    withRetrySpy.mockRestore();
  });

  it('should throw error for an invalid signature on Devnet', { timeout: 10000 }, async () => {
    const INVALID_SIG = 'invalidSignature1234567890abcdefghij';
    await expect(fetchTransaction(INVALID_SIG)).rejects.toThrow(`failed to get transaction: ${INVALID_SIG}`);
  });
});
