import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { detectSourceKind, runSourceFile } from '../../src/solana/sourceRunner';
import { detectInputKind } from '../../src/solana/simulationService';

describe('sourceRunner - detectSourceKind', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-runner-detect-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('detects .rs file as rust-source', () => {
    const f = path.join(tmpDir, 'main.rs');
    fs.writeFileSync(f, 'fn main() {}');
    expect(detectSourceKind(f)).toBe('rust-source');
  });

  it('detects .ts file as ts-source', () => {
    const f = path.join(tmpDir, 'build.ts');
    fs.writeFileSync(f, 'console.log("");');
    expect(detectSourceKind(f)).toBe('ts-source');
  });

  it.each(['build.js', 'build.mjs', 'build.cjs'])('detects %s as js-source', (name) => {
    const f = path.join(tmpDir, name);
    fs.writeFileSync(f, 'console.log("");');
    expect(detectSourceKind(f)).toBe('js-source');
  });

  it('detects directory with Cargo.toml as rust-source', () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'cargo-proj-'));
    fs.writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname="x"');
    expect(detectSourceKind(dir)).toBe('rust-source');
  });

  it('returns null for directory without Cargo.toml', () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'plain-'));
    expect(detectSourceKind(dir)).toBeNull();
  });

  it('returns null for unknown extension', () => {
    const f = path.join(tmpDir, 'note.txt');
    fs.writeFileSync(f, 'hello');
    expect(detectSourceKind(f)).toBeNull();
  });

  it('returns null for non-existent path', () => {
    expect(detectSourceKind(path.join(tmpDir, 'nope.rs'))).toBeNull();
  });
});

describe('simulationService.detectInputKind - source routing', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-detect-routing-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('routes .rs to rust-source (overrides plain path)', () => {
    const f = path.join(tmpDir, 'tx.rs');
    fs.writeFileSync(f, 'fn main() {}');
    expect(detectInputKind(f)).toBe('rust-source');
  });

  it('routes .ts to ts-source', () => {
    const f = path.join(tmpDir, 'tx.ts');
    fs.writeFileSync(f, 'console.log("");');
    expect(detectInputKind(f)).toBe('ts-source');
  });

  it('routes .b64 to plain path (unchanged behavior)', () => {
    const f = path.join(tmpDir, 'tx.b64');
    fs.writeFileSync(f, 'AQABAg==');
    expect(detectInputKind(f)).toBe('path');
  });

  it('throws on directory without Cargo.toml with helpful message', () => {
    const dir = fs.mkdtempSync(path.join(tmpDir, 'empty-dir-'));
    expect(() => detectInputKind(dir)).toThrow(/Cargo\.toml/);
  });
});

describe('runSourceFile - js runner', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'open-runner-exec-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('captures base64 from last stdout line', async () => {
    const f = path.join(tmpDir, 'good.cjs');
    const fakeB64 = 'A'.repeat(120);
    fs.writeFileSync(f, `console.log("warming up...");\nconsole.log("${fakeB64}");`);
    const result = await runSourceFile(f, { timeoutMs: 10_000 });
    expect(result.base64).toBe(fakeB64);
    expect(result.meta.kind).toBe('js-source');
    expect(result.meta.exitCode).toBe(0);
  });

  it('rejects when no base64 line is produced', async () => {
    const f = path.join(tmpDir, 'silent.cjs');
    fs.writeFileSync(f, `console.log("hello");`);
    await expect(runSourceFile(f, { timeoutMs: 10_000 })).rejects.toThrow(/no base64/i);
  });

  it('rejects when runner exits non-zero', async () => {
    const f = path.join(tmpDir, 'fail.cjs');
    fs.writeFileSync(f, `console.error("boom"); process.exit(2);`);
    await expect(runSourceFile(f, { timeoutMs: 10_000 })).rejects.toThrow(/code 2/);
  });

  it('respects timeout', async () => {
    const f = path.join(tmpDir, 'sleep.cjs');
    fs.writeFileSync(f, `setTimeout(() => {}, 60000);`);
    await expect(runSourceFile(f, { timeoutMs: 500 })).rejects.toThrow(/timed out/i);
  });
});
