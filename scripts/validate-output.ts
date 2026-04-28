import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

// Read a variable from process.env first, then fall back to parsing .env.
// This means the gate works both when the user exports the var in their shell
// and when it only lives in the project .env file.
function readEnvVar(key: string): string {
  if (process.env[key]) return process.env[key]!;
  try {
    const src = readFileSync(resolve(process.cwd(), '.env'), 'utf-8');
    const m = src.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return m?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

const MCP_ENDPOINT_FROM_ENV = readEnvVar('MCP_ENDPOINT_URL');

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

type Category = 'simple' | 'high-cu' | 'deep-cpi' | 'failed' | 'spam';

interface TxFixture {
  category: Category;
  signature: string;
  network: 'mainnet' | 'devnet';
  /** Latency budget for this specific fixture, in ms. */
  budgetMs: number;
  /** Optional notes on how to source a real signature for this slot. */
  hint?: string;
}

const FIXTURES: TxFixture[] = [
  {
    category: 'simple',
    signature:
      '2GMBNCtsxoMWieReZHCvX2W65RvVjtLYem9BsaVXQiCmviJh2TNWQXMB2SZs3CT52QbYDo2ZP3T1e485ep47E4h7',
    network: 'mainnet',
    budgetMs: 8_000,
  },
  {
    category: 'failed',
    signature:
      '2wXAX326f245ULkVVYEwUzAWcpJiyZZHd2BXjApypTseGHuoPjK7DPxBiLGmifviPmaBxy9BkgnBSr2tBByqB3y7',
    network: 'mainnet',
    budgetMs: 8_000,
  },
  {
    category: 'high-cu',
    signature: 'REPLACE_ME_HIGH_CU',
    network: 'mainnet',
    budgetMs: 12_000,
    hint: 'Pick a Jupiter/Raydium swap or large Anchor program tx with cuConsumed > 800k.',
  },
  {
    category: 'deep-cpi',
    signature: 'REPLACE_ME_DEEP_CPI',
    network: 'mainnet',
    budgetMs: 12_000,
    hint: 'Pick a tx that crosses 3+ programs (e.g. Jupiter routing through 2 AMMs).',
  },
  {
    category: 'spam',
    signature: 'REPLACE_ME_SPAM',
    network: 'mainnet',
    budgetMs: 8_000,
    hint: 'Pick a known dust/airdrop spam tx — tiny amount, unknown SPL token.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Output shape (best-effort — keep loose since CLI is still evolving)
// ─────────────────────────────────────────────────────────────────────────────

// Matches the actual TransferInfo shape emitted by renderJSON.
// amount is a raw string to avoid precision loss on large u64 values.
interface Transfer {
  from?: string;
  to?: string;
  amount?: string;
  token?: string;
  decimals?: number;
  uiAmount?: number;
  usdValue?: number | null;
  isSpamSuspect?: boolean;
}

interface CuCost {
  feeLamports?: number;
  feeSOL?: number;
  feeUSD?: number | null;
}

interface Insight {
  source?: 'rule' | 'mcp' | 'hybrid';
  codeSuggestions?: unknown[];
}

interface CliJsonOutput {
  transfers?: Transfer[];
  costAnalysis?: { transfers?: Transfer[]; cuCost?: CuCost };
  cuCost?: CuCost;
  frameworkComparison?: {
    current?: { framework?: string; cu?: number };
    alternatives?: Array<{ framework?: string; cu?: number; delta?: number }>;
  };
  insights?: Insight[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Run helpers
// ─────────────────────────────────────────────────────────────────────────────

interface RunResult {
  fixture: TxFixture;
  mcpMode: 'on' | 'off';
  outputMode: 'json' | 'terminal';
  latencyMs: number;
  stdout: string;
  stderr: string;
  exitCode: number;
  json: CliJsonOutput | null;
  failures: string[];
}

function runCli(
  fixture: TxFixture,
  mcpMode: 'on' | 'off',
  outputMode: 'json' | 'terminal'
): RunResult {
  const jsonFlag = outputMode === 'json' ? '--json' : '';
  const cmd =
    `npx tsx cli/bin/open.ts tx ${fixture.signature} --network ${fixture.network} ${jsonFlag}`.trimEnd();

  // Build env: propagate current env, then override MCP_ENDPOINT_URL.
  // spawnSync (unlike execFileSync) always populates .stdout/.stderr regardless
  // of exit code, which is essential for capturing the [MCP] Degraded warning.
  // shell:true is required on Windows where npx is a .cmd file.
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (mcpMode === 'off') {
    // Set to empty string — falsy in JS, so the MCP client treats it as "not set".
    env.MCP_ENDPOINT_URL = '';
  } else {
    // Use the value we read from process.env / .env at startup.
    env.MCP_ENDPOINT_URL = MCP_ENDPOINT_FROM_ENV || env.MCP_ENDPOINT_URL || '';
  }
  // Remove colour forcing so terminal output is plain text for section checks.
  delete env.FORCE_COLOR;

  const failures: string[] = [];
  const start = performance.now();

  const proc = spawnSync(cmd, [], {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: fixture.budgetMs * 2,
    shell: true,
    cwd: process.cwd(),
    env,
  });

  const latencyMs = performance.now() - start;
  const stdout = proc.stdout ?? '';
  const stderr = proc.stderr ?? '';
  const exitCode = proc.status ?? 1;

  if (proc.error) {
    failures.push(`Process spawn error: ${proc.error.message}`);
  }

  if (latencyMs > fixture.budgetMs) {
    failures.push(`Latency ${latencyMs.toFixed(0)}ms exceeds budget ${fixture.budgetMs}ms`);
  }

  let json: CliJsonOutput | null = null;
  if (outputMode === 'json') {
    json = tryParseJson(stdout);
    if (!json) failures.push('Could not parse JSON output');
  }

  return { fixture, mcpMode, outputMode, latencyMs, stdout, stderr, exitCode, json, failures };
}

/**
 * Try to extract the JSON object from stdout. We look for the first '{' and
 * the matching '}' at brace depth 0, ignoring braces inside strings. This
 * survives stray log lines printed before/after the JSON payload.
 */
function tryParseJson(stdout: string): CliJsonOutput | null {
  const start = stdout.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;

  for (let i = start; i < stdout.length; i++) {
    const ch = stdout[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (end < 0) return null;
  try {
    return JSON.parse(stdout.slice(start, end + 1)) as CliJsonOutput;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validators (one per scope item from the task)
// ─────────────────────────────────────────────────────────────────────────────

/** Scope #3 — transfer shape: { from, to, amount, token, usdValue, isSpamSuspect } */
function validateTransfers(transfers: Transfer[], fixture: TxFixture, failures: string[]): void {
  // Failed txs may legitimately produce zero net transfers. Skip emptiness check.
  if (transfers.length === 0 && fixture.category !== 'failed') {
    failures.push('Empty transfers[] for non-failed tx');
    return;
  }

  for (const [i, t] of transfers.entries()) {
    const where = `transfers[${i}]`;

    // from / to — at least one must be present (inbound or outbound transfer)
    if (!t.from && !t.to) failures.push(`${where}: both from and to are empty`);

    // amount — must be a string (raw u64, no precision loss)
    if (t.amount !== undefined && typeof t.amount !== 'string') {
      failures.push(`${where}.amount must be a string, got ${typeof t.amount}`);
    }

    if (!t.token) failures.push(`${where}.token missing or empty`);

    // usdValue: number | null allowed (null = price oracle missed). NaN never allowed.
    if (!('usdValue' in t)) {
      failures.push(`${where}.usdValue field absent (must be number or null)`);
    } else if (t.usdValue !== null) {
      if (typeof t.usdValue !== 'number' || Number.isNaN(t.usdValue)) {
        failures.push(`${where}.usdValue is NaN or invalid`);
      }
    }

    // isSpamSuspect — must be boolean if present
    if (t.isSpamSuspect !== undefined && typeof t.isSpamSuspect !== 'boolean') {
      failures.push(`${where}.isSpamSuspect present but not boolean`);
    }
  }

  // Category-specific: spam fixture must flag at least one transfer
  if (fixture.category === 'spam' && transfers.length > 0) {
    if (!transfers.some((x) => x.isSpamSuspect === true)) {
      failures.push('Spam fixture: no transfer flagged isSpamSuspect=true');
    }
  }
}

/** Scope #2 — MCP on/off invariants. */
function validateInsights(
  insights: Insight[] | undefined,
  mcpMode: 'on' | 'off',
  failures: string[]
): string[] {
  const warnings: string[] = [];

  if (!Array.isArray(insights)) {
    failures.push('insights[] missing or not an array');
    return warnings;
  }

  if (mcpMode === 'off') {
    // Hard invariant: nothing should leak through as mcp/hybrid when MCP is off.
    const leaked = insights.filter((i) => i.source === 'mcp' || i.source === 'hybrid');
    if (leaked.length > 0) {
      failures.push(
        `MCP off but ${leaked.length} insight(s) have source mcp/hybrid — fallback broken`
      );
    }
  } else {
    // MCP on: if any mcp/hybrid present, codeSuggestions must be populated.
    const upstream = insights.filter((i) => i.source === 'mcp' || i.source === 'hybrid');
    for (const ins of upstream) {
      if (!Array.isArray(ins.codeSuggestions) || ins.codeSuggestions.length === 0) {
        failures.push('MCP/hybrid insight has empty or missing codeSuggestions[]');
      }
    }
    if (upstream.length === 0) {
      // Not a hard fail — endpoint might be down. Surface as warning.
      warnings.push('MCP on but no insights came back as mcp/hybrid (endpoint may be unreachable)');
    }
  }

  return warnings;
}

/** Scope #5 — sanity over the whole JSON body. */
function validateJsonSanity(json: CliJsonOutput, failures: string[]): void {
  const cuCost = json.costAnalysis?.cuCost ?? json.cuCost;
  if (!cuCost) {
    failures.push('cuCost missing (checked both top-level and costAnalysis.cuCost)');
  } else {
    if (typeof cuCost.feeLamports !== 'number' || !Number.isFinite(cuCost.feeLamports)) {
      failures.push('cuCost.feeLamports not a finite number');
    }
    if (typeof cuCost.feeSOL !== 'number' || !Number.isFinite(cuCost.feeSOL)) {
      failures.push('cuCost.feeSOL not a finite number');
    }
    if (!('feeUSD' in cuCost)) {
      failures.push('cuCost.feeUSD field absent (should be number or null)');
    } else if (
      cuCost.feeUSD !== null &&
      (typeof cuCost.feeUSD !== 'number' || Number.isNaN(cuCost.feeUSD))
    ) {
      failures.push('cuCost.feeUSD is NaN or invalid');
    }
  }

  // frameworkComparison — soft: the renderer does not yet emit this field.
  // Flip VALIDATE_STRICT_FRAMEWORK=1 once the pipeline wires it in.
  if (!json.frameworkComparison) {
    if (process.env.VALIDATE_STRICT_FRAMEWORK === '1') {
      failures.push('frameworkComparison missing (VALIDATE_STRICT_FRAMEWORK=1)');
    }
    // else: intentional no-op — expected while the field is being wired up
  } else {
    if (!json.frameworkComparison.current) failures.push('frameworkComparison.current missing');
    if (!Array.isArray(json.frameworkComparison.alternatives)) {
      failures.push('frameworkComparison.alternatives missing or not an array');
    }
  }

  // Naming convention: feeUSD must be camelCase-uppercase. NaN check already done above.
  const serialised = JSON.stringify(json);
  if (/"feeUsd"/.test(serialised))
    failures.push('Field "feeUsd" found — contract requires "feeUSD" (case mismatch)');
  if (/"usdFee"/.test(serialised))
    failures.push('Field "usdFee" found — contract requires "feeUSD" (naming mismatch)');
}

/** Scope #1 — terminal output covers the same sections as JSON. */
function validateTerminalConsistency(
  terminalStdout: string,
  json: CliJsonOutput,
  failures: string[]
): void {
  const expectedSections: Array<{ label: string; presentInJson: boolean }> = [
    {
      label: 'Transfer',
      presentInJson: (json.transfers ?? []).length > 0,
    },
    { label: 'CU Cost', presentInJson: !!json.cuCost },
    // frameworkComparison is optional while the pipeline is still wiring it in
    { label: 'Framework', presentInJson: !!json.frameworkComparison },
    { label: 'Insight', presentInJson: Array.isArray(json.insights) && json.insights.length > 0 },
  ];

  // Lowercase compare so we tolerate "TRANSFER BREAKDOWN", "Transfers:", etc.
  const haystack = terminalStdout.toLowerCase();
  for (const section of expectedSections) {
    if (!section.presentInJson) continue; // only assert for sections that actually have content
    if (!haystack.includes(section.label.toLowerCase())) {
      failures.push(`Terminal output missing "${section.label}" section that exists in JSON`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Driver
// ─────────────────────────────────────────────────────────────────────────────

interface FixtureReport {
  fixture: TxFixture;
  jsonOff: RunResult;
  jsonOn: RunResult;
  terminal: RunResult;
  warnings: string[];
}

function runFixture(fixture: TxFixture): FixtureReport {
  const warnings: string[] = [];

  // Run 1: --json with MCP off (fallback path)
  const jsonOff = runCli(fixture, 'off', 'json');
  if (jsonOff.json) {
    const transfers = jsonOff.json.costAnalysis?.transfers ?? jsonOff.json.transfers ?? [];
    validateTransfers(transfers, fixture, jsonOff.failures);
    validateJsonSanity(jsonOff.json, jsonOff.failures);
    warnings.push(...validateInsights(jsonOff.json.insights, 'off', jsonOff.failures));
  }

  // Run 2: --json with MCP on (real endpoint)
  const jsonOn = runCli(fixture, 'on', 'json');
  if (jsonOn.json) {
    const transfers = jsonOn.json.costAnalysis?.transfers ?? jsonOn.json.transfers ?? [];
    validateTransfers(transfers, fixture, jsonOn.failures);
    validateJsonSanity(jsonOn.json, jsonOn.failures);
    warnings.push(...validateInsights(jsonOn.json.insights, 'on', jsonOn.failures));
  }

  // Run 3: terminal mode (MCP off — we just need the rendering, not the upstream calls)
  const terminal = runCli(fixture, 'off', 'terminal');
  if (jsonOff.json) {
    validateTerminalConsistency(terminal.stdout, jsonOff.json, terminal.failures);
  }

  return { fixture, jsonOff, jsonOn, terminal, warnings };
}

function main(): void {
  console.log('\n=== Release gate (Task 3.6.4) ===\n');

  // Fail fast on placeholders — gate is not meaningful with fake fixtures.
  const placeholders = FIXTURES.filter((f) => f.signature.startsWith('REPLACE_ME'));
  if (placeholders.length > 0) {
    console.error('Configuration error: fixtures still contain placeholders.\n');
    for (const p of placeholders) {
      console.error(`  - ${p.category}: ${p.hint ?? 'replace with a real signature'}`);
    }
    console.error(
      '\nEdit scripts/validate-output.ts and replace each REPLACE_ME_* before running.\n'
    );
    process.exit(2);
  }

  const reports: FixtureReport[] = [];
  for (const fixture of FIXTURES) {
    const tag = `${fixture.category.padEnd(8)} ${fixture.signature.slice(0, 12)}…`;
    process.stdout.write(`> ${tag}  `);
    const report = runFixture(fixture);
    reports.push(report);

    const allFailures = [
      ...report.jsonOff.failures.map((f) => `[json off] ${f}`),
      ...report.jsonOn.failures.map((f) => `[json on]  ${f}`),
      ...report.terminal.failures.map((f) => `[terminal] ${f}`),
    ];

    const totalLatency =
      report.jsonOff.latencyMs + report.jsonOn.latencyMs + report.terminal.latencyMs;
    const status = allFailures.length === 0 ? 'PASS' : 'FAIL';
    console.log(`${status}  (${totalLatency.toFixed(0)}ms total across 3 runs)`);

    for (const f of allFailures) console.log(`     ✗ ${f}`);
    for (const w of report.warnings) console.log(`     ⚠ ${w}`);
  }

  // Final verdict
  const failed = reports.filter(
    (r) => r.jsonOff.failures.length + r.jsonOn.failures.length + r.terminal.failures.length > 0
  );
  const passCount = reports.length - failed.length;

  console.log(`\n=== ${passCount}/${reports.length} fixtures passed ===`);
  if (failed.length === 0) {
    console.log('Verdict: GO\n');
    process.exit(0);
  } else {
    console.log('Verdict: NO-GO');
    console.log('Blocking fixtures:');
    for (const r of failed)
      console.log(`  - ${r.fixture.category} (${r.fixture.signature.slice(0, 12)}…)`);
    console.log('');
    process.exit(1);
  }
}

main();
