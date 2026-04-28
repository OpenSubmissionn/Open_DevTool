/**
 * Release gate - Task 3.6.4
 *
 * Runs the CLI against reference transactions in --json mode, validates the
 * structure of the output, measures latency, and exits 0 if all checks pass.
 *
 * Usage:
 *   # MCP off (forces degraded fallback)
 *   $env:MCP_ENDPOINT_URL=""; npm run validate:output --workspace @open/scripts
 *
 *   # MCP on (uses real endpoint from .env)
 *   npm run validate:output --workspace @open/scripts
 */

import { execSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

interface TxFixture {
  category: 'success' | 'failed' | 'high-cu';
  signature: string;
  network: 'mainnet' | 'devnet';
}

const FIXTURES: TxFixture[] = [
  { category: 'success', signature: '2GMBNCtsxoMWieReZHCvX2W65RvVjtLYem9BsaVXQiCmviJh2TNWQXMB2SZs3CT52QbYDo2ZP3T1e485ep47E4h7', network: 'mainnet' },
  { category: 'failed', signature: '2wXAX326f245ULkVVYEwUzAWcpJiyZZHd2BXjApypTseGHuoPjK7DPxBiLGmifviPmaBxy9BkgnBSr2tBByqB3y7', network: 'mainnet' },
  { category: 'high-cu', signature: 'REPLACE_ME_HIGH_CU', network: 'mainnet' },
];

const LATENCY_BUDGET_MS = 10_000;

interface CliJsonOutput {
  transfers?: Array<{ from?: string; to?: string; token?: string; uiAmount?: number }>;
  costAnalysis?: {
    transfers?: Array<{ from?: string; to?: string }>;
    cuCost?: { feeLamports?: number; feeSOL?: number; feeUSD?: number | null };
  };
  cuCost?: { feeLamports?: number; feeSOL?: number; feeUSD?: number | null };
  frameworkComparison?: {
    current?: { framework?: string; cu?: number };
    alternatives?: Array<{ framework?: string; cu?: number; delta?: number }>;
  };
  insights?: Array<{ source?: 'rule' | 'mcp' | 'hybrid'; codeSuggestions?: unknown[] }>;
}

interface RunResult {
  fixture: TxFixture;
  latencyMs: number;
  json: CliJsonOutput | null;
  rawStderr: string;
  failures: string[];
}

function runCli(fixture: TxFixture): RunResult {
  const failures: string[] = [];
  const cmd = `npx tsx cli/bin/open.ts tx ${fixture.signature} --network ${fixture.network} --json`;

  const start = performance.now();
  let stdout = '';
  let stderr = '';

  try {
    stdout = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: LATENCY_BUDGET_MS * 2,
    });
  } catch (err: unknown) {
    const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
    stdout = e.stdout?.toString() ?? '';
    stderr = e.stderr?.toString() ?? '';
    failures.push('CLI exited non-zero');
  }

  const latencyMs = performance.now() - start;

  if (latencyMs > LATENCY_BUDGET_MS) {
    failures.push(`Latency ${latencyMs.toFixed(0)}ms exceeds budget ${LATENCY_BUDGET_MS}ms`);
  }

  let json: CliJsonOutput | null = null;
  try {
    const firstBrace = stdout.indexOf('{');
    if (firstBrace < 0) throw new Error('no JSON object found in stdout');
    json = JSON.parse(stdout.slice(firstBrace)) as CliJsonOutput;
  } catch (err) {
    failures.push(`Could not parse JSON output: ${(err as Error).message}`);
  }

  return { fixture, latencyMs, json, rawStderr: stderr, failures };
}

function validateStructure(result: RunResult, mcpOn: boolean): void {
  const { json, failures, fixture } = result;
  if (!json) return;

  const transfers = json.costAnalysis?.transfers ?? json.transfers ?? [];

  if (fixture.category !== 'failed') {
    if (transfers.length === 0) {
      failures.push('No transfers in output (expected at least one for non-failed tx)');
    }
    for (const [i, t] of transfers.entries()) {
      if (!t.from && !t.to) {
        failures.push(`Transfer #${i}: both from and to are empty`);
      }
    }
  }

  const cuCost = json.costAnalysis?.cuCost ?? json.cuCost;
  if (!cuCost) {
    failures.push('Missing cuCost in output');
  } else {
    if (typeof cuCost.feeLamports !== 'number') failures.push('cuCost.feeLamports missing/invalid');
    if (typeof cuCost.feeSOL !== 'number') failures.push('cuCost.feeSOL missing/invalid');
    if (!('feeUSD' in cuCost)) failures.push('cuCost.feeUSD field missing');
  }

  if (!json.frameworkComparison) {
    failures.push('Missing frameworkComparison in output');
  } else {
    if (!json.frameworkComparison.current) failures.push('frameworkComparison.current missing');
    if (!Array.isArray(json.frameworkComparison.alternatives)) {
      failures.push('frameworkComparison.alternatives missing/not array');
    }
  }

  if (!Array.isArray(json.insights)) {
    failures.push('Missing insights array');
  } else if (mcpOn) {
    if (json.insights.length === 0) failures.push('No insights returned in MCP on mode');
  } else {
    const leaked = json.insights.filter((i) => i.source === 'mcp' || i.source === 'hybrid');
    if (leaked.length > 0) {
      failures.push(`MCP off but found ${leaked.length} mcp/hybrid insight(s) - fallback broken`);
    }
  }
}

function main(): void {
  const mcpOn = !!process.env.MCP_ENDPOINT_URL;
  const mode = mcpOn ? 'MCP on' : 'MCP off';

  console.log(`\n=== Release gate (Task 3.6.4) - ${mode} ===\n`);

  const placeholders = FIXTURES.filter((f) => f.signature.startsWith('REPLACE_ME'));
  if (placeholders.length > 0) {
    console.error('FAIL: Fixtures still contain placeholder signatures.');
    console.error('Edit scripts/validate-output.ts and replace REPLACE_ME_* with real signatures.\n');
    process.exit(2);
  }

  const results: RunResult[] = [];
  for (const fixture of FIXTURES) {
    process.stdout.write(`> ${fixture.category.padEnd(8)} ${fixture.signature.slice(0, 12)}...  `);
    const result = runCli(fixture);
    validateStructure(result, mcpOn);
    results.push(result);
    const status = result.failures.length === 0 ? 'PASS' : 'FAIL';
    console.log(`${status}  ${result.latencyMs.toFixed(0)}ms`);
    for (const f of result.failures) console.log(`     - ${f}`);
  }

  const failed = results.filter((r) => r.failures.length > 0);
  console.log(`\n=== Result: ${results.length - failed.length}/${results.length} passed ===\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
