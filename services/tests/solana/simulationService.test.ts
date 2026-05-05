import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { detectInputKind } from '../../src/solana/simulationService';

describe('simulationService - detectInputKind', () => {
  let tmpDir: string;
  let tmpFile: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-sim-'));
    tmpFile = path.join(tmpDir, 'tx.b64');
    fs.writeFileSync(tmpFile, 'AQABAg==', 'utf-8');
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('detects a base64 transaction blob', () => {
    const b64 = Buffer.from('hello world transaction bytes here').toString('base64');
    expect(detectInputKind(b64)).toBe('base64');
  });

  it('detects an existing file path', () => {
    expect(detectInputKind(tmpFile)).toBe('path');
  });

  it('rejects an 88-char base58 signature with a guidance message pointing to `open tx`', () => {
    const sig = '4'.repeat(88);
    expect(() => detectInputKind(sig)).toThrow(/open tx <signature>/);
  });

  it('rejects an 87-char base58 signature with the same guidance', () => {
    const sig = '5'.repeat(87);
    expect(() => detectInputKind(sig)).toThrow(/open tx <signature>/);
  });

  it('throws on input that is neither path nor base64', () => {
    expect(() => detectInputKind('!!! invalid @@@')).toThrow(/Unable to detect input kind/);
  });

  it('throws on empty input', () => {
    expect(() => detectInputKind('')).toThrow();
  });
});
