import fs from 'fs';
import path from 'path';
import os from 'os';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IdlCache, fetchIdlWithCache, CACHE_FORMAT_VERSION } from '../../src/solana/idlcache';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const PROGRAM_ID_2 = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';

const SAMPLE_IDL = {
  version: '0.1.0',
  name: 'token_program',
  instructions: [{ name: 'transfer', accounts: [], args: [] }],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'idl-cache-test-'));
}

function makeCache(overrides: ConstructorParameters<typeof IdlCache>[0] = {}) {
  return new IdlCache({ cacheDir: tmpDir(), ...overrides });
}

function entryFilePath(cache: IdlCache, programId: string): string {
  const safe = programId.replace(/[^a-zA-Z0-9_-]/g, '_');
  // Access private members via bracket notation for test inspection only.
  const dir = (cache as any).versionedDir();
  return path.join(dir, `${safe}.json`);
}

// ─── Basic get / set ──────────────────────────────────────────────────────────

describe('IdlCache — basic get/set', () => {
  it('returns null on cold cache (miss)', () => {
    const cache = makeCache();
    expect(cache.get(PROGRAM_ID)).toBeNull();
    expect(cache.metrics.misses).toBe(1);
    expect(cache.metrics.hits).toBe(0);
  });

  it('returns the cached entry after set', () => {
    const cache = makeCache();
    cache.set(PROGRAM_ID, SAMPLE_IDL, '0.1.0');

    const entry = cache.get(PROGRAM_ID);
    expect(entry).not.toBeNull();
    expect(entry!.idl).toEqual(SAMPLE_IDL);
    expect(entry!.version).toBe('0.1.0');
    expect(entry!.programId).toBe(PROGRAM_ID);
    expect(cache.metrics.hits).toBe(1);
  });

  it('stores a non-empty checksum', () => {
    const cache = makeCache();
    cache.set(PROGRAM_ID, SAMPLE_IDL);
    const entry = cache.get(PROGRAM_ID);
    expect(entry!.checksum).toHaveLength(16);
  });

  it('persists a JSON file in the versioned subdirectory', () => {
    const cacheDir = tmpDir();
    const cache = new IdlCache({ cacheDir });
    cache.set(PROGRAM_ID, SAMPLE_IDL);

    const filePath = entryFilePath(cache, PROGRAM_ID);
    expect(fs.existsSync(filePath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(parsed.programId).toBe(PROGRAM_ID);
  });

  it('cache directory uses the correct format version', () => {
    const cacheDir = tmpDir();
    const cache = new IdlCache({ cacheDir });
    cache.set(PROGRAM_ID, SAMPLE_IDL);
    expect(fs.existsSync(path.join(cacheDir, CACHE_FORMAT_VERSION))).toBe(true);
  });
});

// ─── TTL ─────────────────────────────────────────────────────────────────────

describe('IdlCache — TTL', () => {
  it('returns a live entry when within TTL', () => {
    const cache = makeCache({ ttlMs: 60_000 }); // 1 min
    cache.set(PROGRAM_ID, SAMPLE_IDL);
    expect(cache.get(PROGRAM_ID)).not.toBeNull();
  });

  it('returns null and counts a miss when entry has expired', async () => {
    const cache = makeCache({ ttlMs: 10 }); // 10 ms
    cache.set(PROGRAM_ID, SAMPLE_IDL);
    await new Promise((r) => setTimeout(r, 20));

    expect(cache.get(PROGRAM_ID)).toBeNull();
    expect(cache.metrics.misses).toBe(1);
  });

  it('deletes the expired file from disk', async () => {
    const cache = makeCache({ ttlMs: 10 });
    cache.set(PROGRAM_ID, SAMPLE_IDL);
    const filePath = entryFilePath(cache, PROGRAM_ID);

    await new Promise((r) => setTimeout(r, 20));
    cache.get(PROGRAM_ID); // triggers delete

    expect(fs.existsSync(filePath)).toBe(false);
  });
});

// ─── --no-cache flag ──────────────────────────────────────────────────────────

describe('IdlCache — --no-cache flag', () => {
  it('get always returns null when noCache=true', () => {
    const cache = makeCache({ noCache: true });
    cache.set(PROGRAM_ID, SAMPLE_IDL); // should be a no-op
    expect(cache.get(PROGRAM_ID)).toBeNull();
  });

  it('set writes nothing to disk when noCache=true', () => {
    const cacheDir = tmpDir();
    const cache = new IdlCache({ cacheDir, noCache: true });
    cache.set(PROGRAM_ID, SAMPLE_IDL);

    const versionedDir = path.join(cacheDir, CACHE_FORMAT_VERSION);
    const hasFiles = fs.existsSync(versionedDir) && fs.readdirSync(versionedDir).length > 0;
    expect(hasFiles).toBe(false);
  });
});

// ─── Invalidation ────────────────────────────────────────────────────────────

describe('IdlCache — invalidation', () => {
  it('delete removes a specific entry', () => {
    const cache = makeCache();
    cache.set(PROGRAM_ID, SAMPLE_IDL);
    cache.delete(PROGRAM_ID);
    expect(cache.get(PROGRAM_ID)).toBeNull();
  });

  it('clear removes all entries', () => {
    const cache = makeCache();
    cache.set(PROGRAM_ID, SAMPLE_IDL);
    cache.set(PROGRAM_ID_2, SAMPLE_IDL);
    cache.clear();
    expect(cache.get(PROGRAM_ID)).toBeNull();
    expect(cache.get(PROGRAM_ID_2)).toBeNull();
  });

  it('clear leaves the directory structure intact', () => {
    const cacheDir = tmpDir();
    const cache = new IdlCache({ cacheDir });
    cache.set(PROGRAM_ID, SAMPLE_IDL);
    cache.clear();
    expect(fs.existsSync(path.join(cacheDir, CACHE_FORMAT_VERSION))).toBe(true);
  });

  it('delete is idempotent (no throw on missing entry)', () => {
    const cache = makeCache();
    expect(() => cache.delete(PROGRAM_ID)).not.toThrow();
  });
});

// ─── Error resilience ────────────────────────────────────────────────────────

describe('IdlCache — error resilience', () => {
  it('returns null and increments errors on corrupt JSON', () => {
    const cacheDir = tmpDir();
    const cache = new IdlCache({ cacheDir });
    cache.set(PROGRAM_ID, SAMPLE_IDL);

    fs.writeFileSync(entryFilePath(cache, PROGRAM_ID), '{ not valid json }');

    expect(cache.get(PROGRAM_ID)).toBeNull();
    expect(cache.metrics.errors).toBe(1);
  });

  it('returns null and increments errors on checksum mismatch', () => {
    const cacheDir = tmpDir();
    const cache = new IdlCache({ cacheDir });
    cache.set(PROGRAM_ID, SAMPLE_IDL);

    const filePath = entryFilePath(cache, PROGRAM_ID);
    const entry = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    entry.checksum = 'deadbeefdeadbeef'; // tamper
    fs.writeFileSync(filePath, JSON.stringify(entry));

    expect(cache.get(PROGRAM_ID)).toBeNull();
    expect(cache.metrics.errors).toBe(1);
  });

  it('deletes the corrupt file from disk', () => {
    const cacheDir = tmpDir();
    const cache = new IdlCache({ cacheDir });
    cache.set(PROGRAM_ID, SAMPLE_IDL);

    const filePath = entryFilePath(cache, PROGRAM_ID);
    const entry = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    entry.checksum = '0000000000000000';
    fs.writeFileSync(filePath, JSON.stringify(entry));

    cache.get(PROGRAM_ID); // should auto-delete
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('set is a no-op (no throw) when disk write fails', () => {
    const cache = makeCache();
    // Make the versioned dir a file so writes fail.
    const dir = (cache as any).versionedDir();
    fs.rmdirSync(dir);
    fs.writeFileSync(dir, 'block'); // now a file, not a dir

    expect(() => cache.set(PROGRAM_ID, SAMPLE_IDL)).not.toThrow();
  });
});

// ─── Metrics ─────────────────────────────────────────────────────────────────

describe('IdlCache — metrics', () => {
  it("hit rate is '0.00%' on a cold cache", () => {
    const cache = makeCache();
    expect(cache.metrics.hitRate()).toBe('0.00%');
  });

  it("hit rate is '100.00%' after a pure hit session", () => {
    const cache = makeCache();
    cache.set(PROGRAM_ID, SAMPLE_IDL);
    cache.get(PROGRAM_ID);
    expect(cache.metrics.hitRate()).toBe('100.00%');
  });

  it("hit rate is '50.00%' after 1 hit and 1 miss", () => {
    const cache = makeCache();
    cache.set(PROGRAM_ID, SAMPLE_IDL);
    cache.get(PROGRAM_ID); // hit
    cache.get('MissingProgramXXXXXXX'); // miss
    expect(cache.metrics.hitRate()).toBe('50.00%');
  });
});

// ─── listEntries ─────────────────────────────────────────────────────────────

describe('IdlCache — listEntries', () => {
  it('returns an entry after set', () => {
    const cache = makeCache();
    cache.set(PROGRAM_ID, SAMPLE_IDL, '0.1.0');

    const entries = cache.listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].programId).toBe(PROGRAM_ID);
    expect(entries[0].version).toBe('0.1.0');
    expect(entries[0].expired).toBe(false);
    expect(entries[0].ageMs).toBeGreaterThanOrEqual(0);
  });

  it('marks an expired entry as expired', async () => {
    const cache = makeCache({ ttlMs: 10 });
    cache.set(PROGRAM_ID, SAMPLE_IDL);
    await new Promise((r) => setTimeout(r, 20));

    const entries = cache.listEntries();
    expect(entries[0].expired).toBe(true);
  });

  it('returns empty array when cache dir does not exist', () => {
    const cache = new IdlCache({ cacheDir: path.join(tmpDir(), 'nonexistent') });
    // Recreate with a fresh non-existing path — override ensureCacheDir.
    const entries = cache.listEntries();
    expect(Array.isArray(entries)).toBe(true);
  });
});

// ─── fetchIdlWithCache — integration ─────────────────────────────────────────

describe('fetchIdlWithCache', () => {
  it('calls fetcher on cache miss and returns the IDL', async () => {
    const cache = makeCache();
    const fetcher = vi.fn().mockResolvedValue({ idl: SAMPLE_IDL, version: '0.1.0' });

    const result = await fetchIdlWithCache(PROGRAM_ID, fetcher, cache);
    expect(result.idl).toEqual(SAMPLE_IDL);
    expect(result.source).toBe('network');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns from cache on second call without calling fetcher again', async () => {
    const cache = makeCache();
    const fetcher = vi.fn().mockResolvedValue({ idl: SAMPLE_IDL });

    await fetchIdlWithCache(PROGRAM_ID, fetcher, cache);
    const result = await fetchIdlWithCache(PROGRAM_ID, fetcher, cache);

    expect(result.source).toBe('cache');
    expect(fetcher).toHaveBeenCalledTimes(1); // not called a second time
  });

  it('retries fetcher up to 3 times on transient failures', async () => {
    const cache = makeCache();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue({ idl: SAMPLE_IDL });

    const result = await fetchIdlWithCache(PROGRAM_ID, fetcher, cache);
    expect(result.idl).toEqual(SAMPLE_IDL);
    expect(fetcher).toHaveBeenCalledTimes(3);
  }, 10_000);

  it('throws after all retries are exhausted (fallback unavailable)', async () => {
    const cache = makeCache();
    const fetcher = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(fetchIdlWithCache(PROGRAM_ID, fetcher, cache)).rejects.toThrow('network down');
    expect(fetcher).toHaveBeenCalledTimes(3);
  }, 15_000);

  it('bypasses cache entirely when noCache=true (fetcher called every time)', async () => {
    const cache = makeCache({ noCache: true });
    const fetcher = vi.fn().mockResolvedValue({ idl: SAMPLE_IDL });

    await fetchIdlWithCache(PROGRAM_ID, fetcher, cache);
    await fetchIdlWithCache(PROGRAM_ID, fetcher, cache);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('reports latency in the result', async () => {
    const cache = makeCache();
    const fetcher = vi.fn().mockResolvedValue({ idl: SAMPLE_IDL });
    const result = await fetchIdlWithCache(PROGRAM_ID, fetcher, cache);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  // ── 40%+ latency reduction target ──────────────────────────────────────────

  it('cache hit is ≥40% faster than a simulated network fetch', async () => {
    const SIMULATED_NETWORK_DELAY_MS = 100;
    const cache = makeCache();

    const fetcher = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise<{ idl: typeof SAMPLE_IDL }>((resolve) =>
            setTimeout(() => resolve({ idl: SAMPLE_IDL }), SIMULATED_NETWORK_DELAY_MS)
          )
      );

    // Warm the cache (network fetch)
    const networkResult = await fetchIdlWithCache(PROGRAM_ID, fetcher, cache);
    expect(networkResult.source).toBe('network');

    // Cache hit
    const cacheResult = await fetchIdlWithCache(PROGRAM_ID, fetcher, cache);
    expect(cacheResult.source).toBe('cache');

    const reductionRatio =
      (networkResult.latencyMs - cacheResult.latencyMs) / networkResult.latencyMs;

    console.log(
      `Latency — network: ${networkResult.latencyMs.toFixed(1)} ms, ` +
        `cache: ${cacheResult.latencyMs.toFixed(1)} ms, ` +
        `reduction: ${(reductionRatio * 100).toFixed(1)}%`
    );

    // Cache hit must be at least 40% faster (task target).
    expect(reductionRatio).toBeGreaterThanOrEqual(0.4);
  }, 10_000);
});
