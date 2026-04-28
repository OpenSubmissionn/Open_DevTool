import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

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

interface Transfer {
  from?: string;
  to?: string;
  amount?: number;
  token?: string;
  usd?: number | null;
  spam?: boolean;
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
  const args = ['tsx', 'cli/bin/open.ts', 'tx', fixture.signature, '--network', fixture.network];
  if (outputMode === 'json') args.push('--json');

  // Inherit env, but force-clear MCP_ENDPOINT_URL when mcpMode === 'off'.
  // This is more reliable than asking the operator to unset it manually.
  const env = { ...process.env };
  if (mcpMode === 'off') {
    env.MCP_ENDPOINT_URL = '';
  } else if (!env.MCP_ENDPOINT_URL) {
    // Operator asked for MCP-on but didn't configure it. We still run,
    // but the result interpretation will be relaxed.
  }

  const failures: string[] = [];
  const start = performance.now();
  let stdout = '';
  let stderr = '';
  let exitCode = 0;

  try {
    stdout = execFileSync('npx', args, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: fixture.budgetMs * 2,
      env,
    });
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string; status?: number };
    stdout = e.stdout?.toString() ?? '';
    stderr = e.stderr?.toString() ?? '';
    exitCode = e.status ?? 1;
    // Failed txs are expected to come back with non-zero from the CLI in some
    // implementations and zero in others — don't auto-fail here. Callers decide.
  }

  const latencyMs = performance.now() - start;
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

/** Scope #3 — transfer shape: { from, to, amount, token, usd, spam } */
function validateTransfers(transfers: Transfer[], fixture: TxFixture, failures: string[]): void {
  // Failed txs may legitimately produce zero net transfers. Skip emptiness check.
  if (transfers.length === 0 && fixture.category !== 'failed') {
    failures.push('Empty transfers[] for non-failed tx');
    return;
  }

  for (const [i, t] of transfers.entries()) {
    const where = `transfers[${i}]`;

    if (typeof t.from !== 'string' || !t.from)
      failures.push(`${where}.from missing or not a string`);
    if (typeof t.to !== 'string' || !t.to) failures.push(`${where}.to missing or not a string`);

    if (typeof t.amount !== 'number' || !Number.isFinite(t.amount)) {
      failures.push(`${where}.amount not a finite number`);
    }
    if (typeof t.token !== 'string' || !t.token) failures.push(`${where}.token missing`);

    // usd: number | null allowed (null = price oracle missed). NaN never allowed.
    if (t.usd !== null && t.usd !== undefined) {
      if (typeof t.usd !== 'number' || Number.isNaN(t.usd)) {
        failures.push(`${where}.usd is NaN or invalid`);
      }
    }
    if (t.usd === undefined) failures.push(`${where}.usd field absent (should be number or null)`);

    // spam optional, but if present must be boolean
    if (t.spam !== undefined && typeof t.spam !== 'boolean') {
      failures.push(`${where}.spam present but not boolean`);
    }

    // Category-specific: spam fixture should produce at least one spam:true
    if (fixture.category === 'spam' && i === transfers.length - 1) {
      const anySpam = transfers.some((x) => x.spam === true);
      if (!anySpam) failures.push('Spam fixture produced no transfer with spam:true');
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

  if (!json.frameworkComparison) {
    failures.push('frameworkComparison missing');
  } else {
    if (!json.frameworkComparison.current) failures.push('frameworkComparison.current missing');
    if (!Array.isArray(json.frameworkComparison.alternatives)) {
      failures.push('frameworkComparison.alternatives missing or not an array');
    }
  }

  // Check naming convention sanity — no duplicated/inconsistent fee fields.
  const hasFeeUsdLowercase = JSON.stringify(json).match(/"feeUsd"/);
  const hasUsdFee = JSON.stringify(json).match(/"usdFee"/);
  if (hasFeeUsdLowercase)
    failures.push('Field "feeUsd" found — expected "feeUSD" (case inconsistent)');
  if (hasUsdFee) failures.push('Field "usdFee" found — expected "feeUSD" (naming inconsistent)');
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
      presentInJson: (json.costAnalysis?.transfers ?? json.transfers ?? []).length > 0,
    },
    { label: 'CU Cost', presentInJson: !!(json.costAnalysis?.cuCost ?? json.cuCost) },
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
