// services/tests/analysis/logParser.test.ts

import { describe, it, expect } from 'vitest';
import { parseLogsFromBundle } from '../../src/analysis/logParser';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const SYSTEM = '11111111111111111111111111111111';
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const VOTE = 'Vote111111111111111111111111111111111111111';
const JUP = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
const WHIRL = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';

// ─────────────────────────────────────────────────────────────────────────────

describe('parseLogsFromBundle', () => {
  // ── Output shape ────────────────────────────────────────────────────────────

  describe('output shape', () => {
    it('always returns the three required top-level fields', () => {
      const result = parseLogsFromBundle([]);
      expect(result).toHaveProperty('byProgram');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('totalLines');
    });

    it('does not include parseTimeMs when verbose is omitted', () => {
      const result = parseLogsFromBundle([]);
      expect(result.parseTimeMs).toBeUndefined();
    });

    it('does not include parseTimeMs when verbose=false', () => {
      const result = parseLogsFromBundle([], false);
      expect(result.parseTimeMs).toBeUndefined();
    });

    it('includes parseTimeMs as a non-negative number when verbose=true', () => {
      const result = parseLogsFromBundle([], true);
      expect(typeof result.parseTimeMs).toBe('number');
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Empty / trivial inputs ──────────────────────────────────────────────────

  describe('empty and trivial inputs', () => {
    it('handles an empty log array without throwing', () => {
      const result = parseLogsFromBundle([]);
      expect(result.totalLines).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.byProgram).toEqual({});
    });

    it('ignores lines that do not start with "Program"', () => {
      const result = parseLogsFromBundle([
        'Transaction executed in slot 123',
        '  some indented note',
        '',
      ]);
      expect(result.byProgram).toEqual({});
      expect(result.errors).toHaveLength(0);
      expect(result.totalLines).toBe(3);
    });

    it('counts totalLines including unrecognised lines', () => {
      const logs = [
        `Program ${SYSTEM} invoke [1]`,
        'this line is ignored',
        `Program ${SYSTEM} success`,
      ];
      expect(parseLogsFromBundle(logs).totalLines).toBe(3);
    });

    it('silently ignores "Program X success" lines', () => {
      const result = parseLogsFromBundle([`Program ${SYSTEM} success`]);
      expect(result.byProgram).toEqual({});
      expect(result.errors).toHaveLength(0);
    });
  });

  // ── Invocation tracking ─────────────────────────────────────────────────────

  describe('invocation tracking', () => {
    it('increments invocations for a single invoke line', () => {
      const result = parseLogsFromBundle([`Program ${SYSTEM} invoke [1]`]);
      expect(result.byProgram[SYSTEM].invocations).toBe(1);
    });

    it('counts multiple invocations of the same program', () => {
      const result = parseLogsFromBundle([
        `Program ${SYSTEM} invoke [1]`,
        `Program ${SYSTEM} invoke [1]`,
        `Program ${SYSTEM} invoke [1]`,
      ]);
      expect(result.byProgram[SYSTEM].invocations).toBe(3);
    });

    it('tracks invocations for multiple distinct programs independently', () => {
      const result = parseLogsFromBundle([
        `Program ${TOKEN} invoke [1]`,
        `Program ${SYSTEM} invoke [2]`,
        `Program ${TOKEN} invoke [1]`,
      ]);
      expect(result.byProgram[TOKEN].invocations).toBe(2);
      expect(result.byProgram[SYSTEM].invocations).toBe(1);
    });

    it('tracks invocations correctly across CPI depth levels', () => {
      const result = parseLogsFromBundle([
        `Program ${TOKEN} invoke [1]`,
        `Program ${SYSTEM} invoke [2]`,
        `Program ${SYSTEM} consumed 100 of 200000 compute units`,
        `Program ${SYSTEM} success`,
        `Program ${TOKEN} consumed 3000 of 200000 compute units`,
        `Program ${TOKEN} success`,
      ]);
      expect(result.byProgram[TOKEN].invocations).toBe(1);
      expect(result.byProgram[SYSTEM].invocations).toBe(1);
    });
  });

  // ── CU consumption ──────────────────────────────────────────────────────────

  describe('compute unit consumption', () => {
    it('records consumed and limit for a single program', () => {
      const result = parseLogsFromBundle([
        `Program ${SYSTEM} invoke [1]`,
        `Program ${SYSTEM} consumed 150 of 200000 compute units`,
        `Program ${SYSTEM} success`,
      ]);
      expect(result.byProgram[SYSTEM].consumed).toBe(150);
      expect(result.byProgram[SYSTEM].limit).toBe(200000);
    });

    it('accumulates consumed CU across multiple entries for the same program', () => {
      const result = parseLogsFromBundle([
        `Program ${SYSTEM} consumed 100 of 200000 compute units`,
        `Program ${SYSTEM} consumed 250 of 200000 compute units`,
      ]);
      expect(result.byProgram[SYSTEM].consumed).toBe(350);
    });

    it('keeps the last seen limit value for a program', () => {
      const result = parseLogsFromBundle([
        `Program ${SYSTEM} consumed 100 of 200000 compute units`,
        `Program ${SYSTEM} consumed 50 of 400000 compute units`,
      ]);
      expect(result.byProgram[SYSTEM].limit).toBe(400000);
    });

    it('handles large CU values without numeric overflow', () => {
      const result = parseLogsFromBundle([
        `Program ${JUP} consumed 1400000 of 1400000 compute units`,
      ]);
      expect(result.byProgram[JUP].consumed).toBe(1_400_000);
      expect(result.byProgram[JUP].limit).toBe(1_400_000);
    });

    it('tracks CU independently for each program in a multi-program transaction', () => {
      const result = parseLogsFromBundle([
        `Program ${TOKEN} invoke [1]`,
        `Program ${SYSTEM} invoke [2]`,
        `Program ${SYSTEM} consumed 100 of 200000 compute units`,
        `Program ${SYSTEM} success`,
        `Program ${TOKEN} consumed 3000 of 200000 compute units`,
        `Program ${TOKEN} success`,
      ]);
      expect(result.byProgram[SYSTEM].consumed).toBe(100);
      expect(result.byProgram[TOKEN].consumed).toBe(3000);
    });

    it('creates a byProgram entry from a CU line even without a preceding invoke', () => {
      const result = parseLogsFromBundle([`Program ${SYSTEM} consumed 99 of 200000 compute units`]);
      expect(result.byProgram[SYSTEM]).toBeDefined();
      expect(result.byProgram[SYSTEM].consumed).toBe(99);
    });
  });

  // ── Error detection ─────────────────────────────────────────────────────────

  describe('error detection', () => {
    it('captures explicit "Program X failed" lines in errors[]', () => {
      const result = parseLogsFromBundle([`Program ${VOTE} failed: custom program error: 0x1`]);
      expect(result.errors).toContain(`Program ${VOTE} failed: custom program error: 0x1`);
    });

    it('captures "Program log: Error: ..." lines in errors[]', () => {
      const result = parseLogsFromBundle(['Program log: Error: custom program error: 0x1']);
      expect(result.errors).toContain('Error: custom program error: 0x1');
    });

    it('captures log lines containing "fail" (case-insensitive)', () => {
      const result = parseLogsFromBundle(['Program log: Transaction failed due to slippage']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('failed');
    });

    it('captures log lines containing "FAIL" in uppercase', () => {
      const result = parseLogsFromBundle(['Program log: FAIL: slippage exceeded']);
      expect(result.errors).toHaveLength(1);
    });

    it('does not flag benign "Program log" lines as errors', () => {
      const result = parseLogsFromBundle([
        'Program log: Instruction: Transfer',
        'Program log: Instruction: InitializeMint',
        'Program log: Swapping 1000 tokens',
      ]);
      expect(result.errors).toHaveLength(0);
    });

    it('collects both log-level and program-level errors in the same transaction', () => {
      const result = parseLogsFromBundle([
        `Program ${VOTE} invoke [1]`,
        'Program log: Error: custom program error: 0x1',
        `Program ${VOTE} consumed 450 of 200000 compute units`,
        `Program ${VOTE} failed: custom program error: 0x1`,
      ]);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain('Error: custom program error: 0x1');
      expect(result.errors).toContain(`Program ${VOTE} failed: custom program error: 0x1`);
    });

    it('records a failure error even without a preceding invoke or CU line', () => {
      const result = parseLogsFromBundle([`Program ${VOTE} failed: out of compute`]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('out of compute');
    });

    it('preserves the full error reason string verbatim', () => {
      const reason = `Program ${VOTE} failed: custom program error: 0x1abc`;
      const result = parseLogsFromBundle([reason]);
      expect(result.errors[0]).toBe(reason);
    });
  });

  // ── Full transaction scenarios ───────────────────────────────────────────────

  describe('full transaction scenarios', () => {
    it('parses a simple SOL transfer correctly', () => {
      const logs = [
        `Program ${SYSTEM} invoke [1]`,
        'Program log: Instruction: Transfer',
        `Program ${SYSTEM} consumed 150 of 200000 compute units`,
        `Program ${SYSTEM} success`,
      ];
      const result = parseLogsFromBundle(logs);

      expect(result.totalLines).toBe(4);
      expect(result.errors).toHaveLength(0);
      expect(result.byProgram[SYSTEM].invocations).toBe(1);
      expect(result.byProgram[SYSTEM].consumed).toBe(150);
      expect(result.byProgram[SYSTEM].limit).toBe(200000);
    });

    it('parses a CPI transaction (token program calling system program)', () => {
      const logs = [
        `Program ${TOKEN} invoke [1]`,
        'Program log: Instruction: InitializeMint',
        `Program ${SYSTEM} invoke [2]`,
        `Program ${SYSTEM} consumed 100 of 200000 compute units`,
        `Program ${SYSTEM} success`,
        `Program ${TOKEN} consumed 3000 of 200000 compute units`,
        `Program ${TOKEN} success`,
      ];
      const result = parseLogsFromBundle(logs);

      expect(result.totalLines).toBe(7);
      expect(result.errors).toHaveLength(0);
      expect(result.byProgram[TOKEN].invocations).toBe(1);
      expect(result.byProgram[TOKEN].consumed).toBe(3000);
      expect(result.byProgram[SYSTEM].invocations).toBe(1);
      expect(result.byProgram[SYSTEM].consumed).toBe(100);
    });

    it('parses a deep-CPI swap transaction with 3 programs', () => {
      const logs = [
        `Program ${JUP} invoke [1]`,
        'Program log: Instruction: Route',
        `Program ${WHIRL} invoke [2]`,
        'Program log: Instruction: Swap',
        `Program ${TOKEN} invoke [3]`,
        `Program ${TOKEN} consumed 4000 of 1400000 compute units`,
        `Program ${TOKEN} success`,
        `Program ${WHIRL} consumed 35000 of 1400000 compute units`,
        `Program ${WHIRL} success`,
        `Program ${JUP} consumed 80000 of 1400000 compute units`,
        `Program ${JUP} success`,
      ];
      const result = parseLogsFromBundle(logs);

      expect(result.errors).toHaveLength(0);
      expect(Object.keys(result.byProgram)).toHaveLength(3);
      expect(result.byProgram[JUP].consumed).toBe(80000);
      expect(result.byProgram[WHIRL].consumed).toBe(35000);
      expect(result.byProgram[TOKEN].consumed).toBe(4000);
    });

    it('parses a failed transaction and records all errors', () => {
      const logs = [
        `Program ${VOTE} invoke [1]`,
        'Program log: Error: custom program error: 0x1',
        `Program ${VOTE} consumed 450 of 200000 compute units`,
        `Program ${VOTE} failed: custom program error: 0x1`,
      ];
      const result = parseLogsFromBundle(logs);

      expect(result.errors).toHaveLength(2);
      expect(result.byProgram[VOTE].consumed).toBe(450);
      expect(result.byProgram[VOTE].invocations).toBe(1);
    });
  });

  // ── Verbose mode ────────────────────────────────────────────────────────────

  describe('verbose mode', () => {
    it('parseTimeMs is a finite positive number on a non-trivial input', () => {
      const logs = Array.from({ length: 200 }, (_, i) =>
        i % 4 === 0
          ? `Program ${SYSTEM} invoke [1]`
          : i % 4 === 1
            ? 'Program log: Instruction: Transfer'
            : i % 4 === 2
              ? `Program ${SYSTEM} consumed ${i * 10} of 200000 compute units`
              : `Program ${SYSTEM} success`
      );
      const result = parseLogsFromBundle(logs, true);
      expect(result.parseTimeMs).toBeGreaterThan(0);
      expect(Number.isFinite(result.parseTimeMs)).toBe(true);
    });

    it('produces the same byProgram output regardless of the verbose flag', () => {
      const logs = [
        `Program ${SYSTEM} invoke [1]`,
        `Program ${SYSTEM} consumed 300 of 200000 compute units`,
        `Program ${SYSTEM} success`,
      ];
      const silent = parseLogsFromBundle(logs, false);
      const verbose = parseLogsFromBundle(logs, true);

      expect(verbose.byProgram).toEqual(silent.byProgram);
      expect(verbose.errors).toEqual(silent.errors);
      expect(verbose.totalLines).toBe(silent.totalLines);
    });
  });
});
