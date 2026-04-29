// services/src/analysis/logParser.ts

export interface ParsedLogs {
  byProgram: Record<string, ProgramStats>;
  errors: string[];
  totalLines: number;
  parseTimeMs?: number;
}

interface ProgramStats {
  consumed: number;
  limit: number;
  invocations: number;
  messages: string[];
}

// Compiled once at module load. RE_ERR_KW runs per "Program log:" line;
// RE_CU and RE_FAILED only run after a charCodeAt dispatch confirms the line type.
const RE_CU = /^Program \S+ consumed (\d+) of (\d+) compute units$/;
const RE_FAILED = /^Program (\w+) failed: (.*)/;
const RE_ERR_KW = /error|fail/i;

// Every Solana log line of interest starts with this prefix.
const PREFIX = 'Program ';
const PREFIX_LEN = PREFIX.length; // 8

function initProgram(): ProgramStats {
  return { consumed: 0, limit: 0, invocations: 0, messages: [] };
}

export function parseLogsFromBundle(logMessages: string[], verbose = false): ParsedLogs {
  const startTime = verbose ? performance.now() : 0;

  const byProgramMap = new Map<string, ProgramStats>();
  const errors: string[] = [];

  // Lazy init: avoids pre-allocating entries for programs that never appear.
  const ensureProgram = (id: string): ProgramStats => {
    let s = byProgramMap.get(id);
    if (s === undefined) {
      s = initProgram();
      byProgramMap.set(id, s);
    }
    return s;
  };

  for (let i = 0; i < logMessages.length; i++) {
    const line = logMessages[i];

    // Reject non-"Program" lines with a single charCodeAt before any string op.
    if (line.charCodeAt(0) !== 80 /* 'P' */) continue;
    if (!line.startsWith(PREFIX)) continue;

    // "Program log: <message>" — detected before programId extraction because
    // the token at PREFIX_LEN is "log", not a base58 program ID.
    if (
      line.charCodeAt(PREFIX_LEN) === 108 /* l */ &&
      line.charCodeAt(PREFIX_LEN + 1) === 111 /* o */ &&
      line.charCodeAt(PREFIX_LEN + 2) === 103 /* g */ &&
      line.charCodeAt(PREFIX_LEN + 3) === 58 /* : */
    ) {
      // Message content starts after "Program log: " (PREFIX_LEN + 5 chars).
      const msg = line.slice(PREFIX_LEN + 5);
      if (RE_ERR_KW.test(msg)) errors.push(msg);
      continue;
    }

    // Slice the program ID from between "Program " and the next space.
    const sp = line.indexOf(' ', PREFIX_LEN);
    if (sp === -1) continue;
    const programId = line.slice(PREFIX_LEN, sp);
    const tokenStart = sp + 1;
    const nextChar = line.charCodeAt(tokenStart);

    // Dispatch on the first two chars of the verb to avoid regex on every line.

    // "invoke" → 'i'(105) 'n'(110)
    if (nextChar === 105 && line.charCodeAt(tokenStart + 1) === 110) {
      ensureProgram(programId).invocations += 1;
      continue;
    }

    // "consumed" → 'c'(99); unary + is faster than parseInt for pure-digit strings.
    if (nextChar === 99) {
      const m = RE_CU.exec(line);
      if (m !== null) {
        const s = ensureProgram(programId);
        s.consumed += +m[1];
        s.limit = +m[2]; // last seen limit wins (matches Solana RPC behaviour)
      }
      continue;
    }

    // "failed" → 'f'(102) 'a'(97); guards against "falsy" or other 'f'-prefixed tokens.
    if (nextChar === 102 && line.charCodeAt(tokenStart + 1) === 97) {
      const m = RE_FAILED.exec(line);
      if (m !== null) errors.push(`Program ${m[1]} failed: ${m[2]}`);
    }

    // "success" and all other verbs are intentionally ignored.
  }

  const result: ParsedLogs = {
    byProgram: Object.fromEntries(byProgramMap),
    errors,
    totalLines: logMessages.length,
  };

  if (verbose) result.parseTimeMs = performance.now() - startTime;
  return result;
}
