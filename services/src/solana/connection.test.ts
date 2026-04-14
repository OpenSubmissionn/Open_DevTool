import { describe, it, expect, vi } from 'vitest';
import { getConnection, withRetry } from './connection';

describe('Solana Connection & Retry Logic', () => {
  it('should fetch the current slot', async () => {
    const connection = getConnection();
    const slot = await withRetry(() => connection.getSlot());
    expect(slot).toBeGreaterThan(0);
  });

  it('should retry 3 times before failing', async () => {
    const failingFn = vi.fn().mockRejectedValue(new Error('Network Timeout'));

    await expect(withRetry(failingFn)).rejects.toThrow('Network Timeout');

    expect(failingFn).toHaveBeenCalledTimes(3);
  }, 10000); // Timeout de 10 segundos para dar tempo dos retries
});
