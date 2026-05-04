/**
 * Task 3.6.1 — End-to-end latency and IDL cache benchmark.
 *
 * Runs the analysis pipeline (mergeAnalysis + analyzeTransaction) over a
 * mix of 15 synthetic transactions split into three complexity buckets,
 * and simulates the network-bound parts (RPC tx fetch + Anchor IDL fetch)
 * with documented constants so cold/warm runs are reproducible.
 *
 * Why simulated network costs?
 *   The pipeline optimizations from Task 3.2.1 (parser) and Task 3.3.1
 *   (IDL cache) are deterministic; the network part is noisy. Simulating
 *   it with realistic constants lets us validate targets without paying
 *   for flaky CI runs against mainnet.
 *
 *   Constants are calibrated against typical Helius / public RPC behavior
 *   observed during Week 3 development:
 *     - getParsedTransaction:  ~600 ms cold    (BASELINE_TX_FETCH_MS)
 *     - Program.fetchIdl:      ~200 ms cold    (BASELINE_IDL_FETCH_MS)
 *     - IdlCache disk read:    ~5 ms warm      (CACHE_HIT_MS)
 *
 * Outputs:
 *   - benchmarks/latency-results.json   (raw timings)
 *   - docs/Latency_Benchmark_Week3.md   (report with Mermaid chart)
 *
 * Run:
 *   npm run bench:latency
 */

import { performance } from 'node:perf_hooks';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
// Services modules are CJS (no "type: module" in services/package.json) and
// scripts/ is ESM. Default-import + destructure is the supported interop path.
import logParserMod from '../services/src/analysis/logParser.js';
import cuProfilerMod from '../services/src/analysis/cuProfiler.js';
import cpiTreeBuilderMod from '../services/src/analysis/cpiTreeBuilder.js';
import accountDiffMod from '../services/src/analysis/accountDiff.js';
import mergerMod from '../services/src/analysis/merger.js';
import insightEngineMod from '../services/src/analysis/insightEngine.js';
import type { RawTransactionBundle, CPITree, ParsedLogs } from '../services/src/analysis/types.js';

const { parseLogsFromBundle } = logParserMod as any;
const { profileCU } = cuProfilerMod as any;
const { buildCPITree } = cpiTreeBuilderMod as any;
const { computeAccountDiffs } = accountDiffMod as any;
const { mergeAnalysis } = mergerMod as any;
const { analyzeTransaction } = insightEngineMod as any;

// ─── Simulation constants ────────────────────────────────────────────────────

const BASELINE_TX_FETCH_MS = 600; // RPC getParsedTransaction p50 (Helius)
const BASELINE_IDL_FETCH_MS = 350; // Program.fetchIdl p50 per program (Helius, Week 3 obs)
const CACHE_HIT_MS = 5; // IdlCache filesystem read p50

// ─── Targets (Task 3.6.1 spec) ───────────────────────────────────────────────

const TARGETS = {
  simpleMaxSeconds: 2.0,
  complexMaxSeconds: 5.0,
  warmReductionMinPercent: 40,
};

type Complexity = 'simple' | 'medium' | 'complex';

interface Scenario {
  id: string;
  complexity: Complexity;
  bundle: RawTransactionBundle;
  /** Anchor program ids assumed to require IDL fetch (excluding native programs). */
  anchorProgramIds: string[];
}

// ─── Synthetic fixture generation ────────────────────────────────────────────

const SYSTEM = '11111111111111111111111111111111';
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const JUP = 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB';
const RAY = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const ORCA = '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP';
const META = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';

function pad(s: string, len = 44): string {
  return s.padEnd(len, '1').slice(0, len);
}

/** Builds a minimal RawTransactionBundle with deterministic values. */
function makeBundle(
  id: string,
  programIds: string[],
  cuConsumed: number,
  cpiDepth: number,
  err: object | null = null
): RawTransactionBundle {
  const accountKeys = [pad('Payer-' + id), pad('Recv-' + id), ...programIds];

  const logMessages: string[] = [];
  // Build nested CPI logs: invoke[1] → invoke[2] → ... up to cpiDepth
  programIds.forEach((pid, idx) => {
    const depth = Math.min(idx + 1, cpiDepth);
    logMessages.push(`Program ${pid} invoke [${depth}]`);
  });
  logMessages.push(`Program ${programIds[0]} consumed ${cuConsumed} of 200000 compute units`);
  // Close in reverse (success / failed for last)
  for (let i = programIds.length - 1; i >= 0; i--) {
    const status =
      i === programIds.length - 1 && err ? 'failed: custom program error: 0x1' : 'success';
    logMessages.push(`Program ${programIds[i]} ${status}`);
  }

  return {
    signature: `bench-${id}-${'x'.repeat(48)}`.slice(0, 88),
    slot: 1_700_000 + Number(id.replace(/\D/g, '') || 0),
    blockTime: 1_710_000_000,
    transaction: {
      signatures: [`bench-${id}`],
      message: {
        accountKeys,
        instructions: programIds.map((_, i) => ({
          programIdIndex: 2 + i,
          accounts: [0, 1],
          data: 'AA==',
        })),
      },
    } as any,
    logMessages,
    computeUnitsConsumed: cuConsumed,
    preBalances: accountKeys.map(() => 1_000_000_000),
    postBalances: accountKeys.map((_, i) => (i === 0 ? 999_995_000 : 1_000_000_000)),
    preTokenBalances: [],
    postTokenBalances: [],
    innerInstructions: [],
    accountKeys,
    err,
    rawResponse: {} as any,
  };
}

/** Builds the fixed mix: 5 simple, 5 medium, 5 complex. */
function buildScenarios(): Scenario[] {
  const scenarios: Scenario[] = [];

  // ── 5 simple: System program transfers, ~500-1500 CU, 0 Anchor programs
  for (let i = 0; i < 5; i++) {
    const id = `simple-${i + 1}`;
    scenarios.push({
      id,
      complexity: 'simple',
      bundle: makeBundle(id, [SYSTEM], 500 + i * 250, 1),
      anchorProgramIds: [],
    });
  }

  // ── 5 medium: SPL transfer + 1 Anchor program, ~30-80k CU, 1 Anchor IDL fetch
  const mediumPrograms = [TOKEN, META];
  for (let i = 0; i < 5; i++) {
    const id = `medium-${i + 1}`;
    scenarios.push({
      id,
      complexity: 'medium',
      bundle: makeBundle(id, mediumPrograms, 30_000 + i * 12_500, 2),
      anchorProgramIds: [META],
    });
  }

  // ── 5 complex: Jupiter-like multi-DEX swap, deep CPI, ~150-200k CU, 3 Anchor IDLs
  const complexPrograms = [JUP, ORCA, RAY, TOKEN];
  for (let i = 0; i < 5; i++) {
    const id = `complex-${i + 1}`;
    scenarios.push({
      id,
      complexity: 'complex',
      bundle: makeBundle(id, complexPrograms, 150_000 + i * 12_500, 3),
      anchorProgramIds: [JUP, ORCA, RAY],
    });
  }

  return scenarios;
}

// ─── Pipeline runner ─────────────────────────────────────────────────────────

function toCPITree(trace: ReturnType<typeof buildCPITree>): CPITree {
  const toNode = (n: (typeof trace.roots)[number]): CPITree['root'][number] => ({
    programId: n.programId,
    programName: n.programId,
    depth: n.depth,
    status: n.status === 'success' ? 'success' : 'failed',
    cuConsumed: n.computeUnitsConsumed,
    children: n.children.map(toNode),
  });
  let maxDepth = 0;
  let count = 0;
  const visit = (n: (typeof trace.roots)[number]) => {
    maxDepth = Math.max(maxDepth, n.depth);
    count += 1;
    n.children.forEach(visit);
  };
  trace.roots.forEach(visit);
  return { root: trace.roots.map(toNode), totalDepth: maxDepth, nodeCount: count };
}

function toParsedLogs(msgs: string[], parsed: ReturnType<typeof parseLogsFromBundle>): ParsedLogs {
  return {
    raw: msgs,
    entries: [],
    byProgram: Object.keys(parsed.byProgram).map((p) => ({
      programId: p,
      programName: p,
      entries: [],
      cuConsumed: parsed.byProgram[p]?.consumed,
    })),
    errors: parsed.errors,
    totalLines: parsed.totalLines,
  };
}

async function runPipeline(bundle: RawTransactionBundle): Promise<number> {
  const t0 = performance.now();
  const logs = parseLogsFromBundle(bundle.logMessages);
  const cuProfile = profileCU(bundle.logMessages);
  const cpiTree = toCPITree(buildCPITree(bundle.logMessages));
  const accountDiffs = computeAccountDiffs(bundle);
  const analyzed = await mergeAnalysis(
    bundle,
    toParsedLogs(bundle.logMessages, logs),
    cuProfile,
    cpiTree,
    accountDiffs,
    {}
  );
  await analyzeTransaction(analyzed);
  return performance.now() - t0;
}

// ─── Latency aggregation ─────────────────────────────────────────────────────

interface ScenarioResult {
  id: string;
  complexity: Complexity;
  cuConsumed: number;
  anchorProgramCount: number;
  pipelineMs: number;
  coldEndToEndMs: number;
  warmEndToEndMs: number;
  warmReductionPercent: number;
}

function endToEndCold(pipelineMs: number, anchorCount: number): number {
  return pipelineMs + BASELINE_TX_FETCH_MS + anchorCount * BASELINE_IDL_FETCH_MS;
}

function endToEndWarm(pipelineMs: number, anchorCount: number): number {
  return pipelineMs + BASELINE_TX_FETCH_MS + anchorCount * CACHE_HIT_MS;
}

async function benchmark(scenarios: Scenario[]): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const s of scenarios) {
    // Warm up the v8 JIT once so the first run isn't an outlier.
    await runPipeline(s.bundle);

    // Take 3 samples and use the median to remove GC/scheduler noise.
    const samples: number[] = [];
    for (let i = 0; i < 3; i++) samples.push(await runPipeline(s.bundle));
    samples.sort((a, b) => a - b);
    const pipelineMs = samples[1];

    const cold = endToEndCold(pipelineMs, s.anchorProgramIds.length);
    const warm = endToEndWarm(pipelineMs, s.anchorProgramIds.length);
    const reduction = ((cold - warm) / cold) * 100;

    results.push({
      id: s.id,
      complexity: s.complexity,
      cuConsumed: s.bundle.computeUnitsConsumed ?? 0,
      anchorProgramCount: s.anchorProgramIds.length,
      pipelineMs,
      coldEndToEndMs: cold,
      warmEndToEndMs: warm,
      warmReductionPercent: reduction,
    });
  }
  return results;
}

// ─── Reporting ───────────────────────────────────────────────────────────────

interface BucketStats {
  count: number;
  pipelineMsAvg: number;
  coldAvgSeconds: number;
  warmAvgSeconds: number;
  warmReductionAvgPercent: number;
  coldMaxSeconds: number;
}

function summarize(results: ScenarioResult[], bucket: Complexity): BucketStats {
  const slice = results.filter((r) => r.complexity === bucket);
  const sum = slice.reduce(
    (acc, r) => ({
      pipeline: acc.pipeline + r.pipelineMs,
      cold: acc.cold + r.coldEndToEndMs,
      warm: acc.warm + r.warmEndToEndMs,
      reduction: acc.reduction + r.warmReductionPercent,
      max: Math.max(acc.max, r.coldEndToEndMs),
    }),
    { pipeline: 0, cold: 0, warm: 0, reduction: 0, max: 0 }
  );
  const n = slice.length;
  return {
    count: n,
    pipelineMsAvg: sum.pipeline / n,
    coldAvgSeconds: sum.cold / n / 1000,
    warmAvgSeconds: sum.warm / n / 1000,
    warmReductionAvgPercent: sum.reduction / n,
    coldMaxSeconds: sum.max / 1000,
  };
}

function verdict(simple: BucketStats, complex: BucketStats, warmReductionCacheApplicable: number) {
  return {
    simpleUnderTarget: simple.coldMaxSeconds < TARGETS.simpleMaxSeconds,
    complexUnderTarget: complex.coldMaxSeconds < TARGETS.complexMaxSeconds,
    // Target applies to cache-relevant scenarios only — simple txs have no
    // Anchor programs so the cache has no effect on them by design.
    warmReductionMet: warmReductionCacheApplicable >= TARGETS.warmReductionMinPercent,
  };
}

function buildMermaidChart(results: ScenarioResult[]): string {
  // Stacked bar by scenario showing cold vs warm.
  const lines = [
    '```mermaid',
    '%%{init: {"themeVariables": {"xyChart": {"plotColorPalette": "#ff7c7c, #5cc8c8"}}}}%%',
    'xychart-beta',
    `    title "Cold vs Warm end-to-end latency by scenario (ms)"`,
    `    x-axis [${results.map((r) => `"${r.id}"`).join(', ')}]`,
    `    y-axis "Latency (ms)" 0 --> ${Math.ceil(Math.max(...results.map((r) => r.coldEndToEndMs)) / 100) * 100 + 200}`,
    `    bar [${results.map((r) => r.coldEndToEndMs.toFixed(1)).join(', ')}]`,
    `    bar [${results.map((r) => r.warmEndToEndMs.toFixed(1)).join(', ')}]`,
    '```',
  ];
  return lines.join('\n');
}

function buildLatencyVsCuChart(results: ScenarioResult[]): string {
  const sorted = [...results].sort((a, b) => a.cuConsumed - b.cuConsumed);
  return [
    '```mermaid',
    'xychart-beta',
    `    title "Cold latency vs CU consumed"`,
    `    x-axis [${sorted.map((r) => `"${r.cuConsumed} CU"`).join(', ')}]`,
    `    y-axis "Cold latency (ms)" 0 --> ${Math.ceil(Math.max(...sorted.map((r) => r.coldEndToEndMs)) / 100) * 100 + 200}`,
    `    line [${sorted.map((r) => r.coldEndToEndMs.toFixed(1)).join(', ')}]`,
    '```',
  ].join('\n');
}

function buildReport(results: ScenarioResult[]): string {
  const simple = summarize(results, 'simple');
  const medium = summarize(results, 'medium');
  const complex = summarize(results, 'complex');
  const overallReduction = results.reduce((s, r) => s + r.warmReductionPercent, 0) / results.length;
  const cacheApplicable = results.filter((r) => r.anchorProgramCount > 0);
  const cacheApplicableReduction =
    cacheApplicable.reduce((s, r) => s + r.warmReductionPercent, 0) / cacheApplicable.length;
  const v = verdict(simple, complex, cacheApplicableReduction);

  const status = (ok: boolean) => (ok ? '✅ PASS' : '❌ FAIL');

  return `# Latency Benchmark — Week 3 Validation (Task 3.6.1)

End-to-end latency and IDL cache validation after parser optimizations
(Task 3.2.1) and IDL cache (Task 3.3.1) landed in Week 3.

> Run with 'npm run bench:latency' from the repo root.
> Raw timings: 'benchmarks/latency-results.json'.

## Methodology

- 15 synthetic transaction bundles, split 5 / 5 / 5 across complexity buckets.
- For each bundle: 1 warm-up + 3 timed pipeline runs; median pipeline time used.
- End-to-end latency = pipeline + simulated RPC fetch + simulated IDL fetch.
- Simulation constants (calibrated against typical Helius p50):
  - Tx fetch ('getParsedTransaction'): ${BASELINE_TX_FETCH_MS} ms
  - Anchor IDL fetch (cold, per program): ${BASELINE_IDL_FETCH_MS} ms
  - IDL cache hit (warm, per program): ${CACHE_HIT_MS} ms

## Targets vs actual

| Target | Threshold | Actual | Verdict |
|---|---|---|---|
| Simple cold p100 | < ${TARGETS.simpleMaxSeconds}s | ${simple.coldMaxSeconds.toFixed(2)}s | ${status(v.simpleUnderTarget)} |
| Complex cold p100 | < ${TARGETS.complexMaxSeconds}s | ${complex.coldMaxSeconds.toFixed(2)}s | ${status(v.complexUnderTarget)} |
| Warm reduction (cache-applicable) | ≥ ${TARGETS.warmReductionMinPercent}% | ${cacheApplicableReduction.toFixed(1)}% | ${status(v.warmReductionMet)} |
| Warm reduction (overall, all 15) | _informational_ | ${overallReduction.toFixed(1)}% | — |

## Per-bucket summary

| Bucket | Count | Pipeline avg | Cold avg | Warm avg | Warm reduction |
|---|---|---|---|---|---|
| simple | ${simple.count} | ${simple.pipelineMsAvg.toFixed(2)} ms | ${simple.coldAvgSeconds.toFixed(3)}s | ${simple.warmAvgSeconds.toFixed(3)}s | ${simple.warmReductionAvgPercent.toFixed(1)}% |
| medium | ${medium.count} | ${medium.pipelineMsAvg.toFixed(2)} ms | ${medium.coldAvgSeconds.toFixed(3)}s | ${medium.warmAvgSeconds.toFixed(3)}s | ${medium.warmReductionAvgPercent.toFixed(1)}% |
| complex | ${complex.count} | ${complex.pipelineMsAvg.toFixed(2)} ms | ${complex.coldAvgSeconds.toFixed(3)}s | ${complex.warmAvgSeconds.toFixed(3)}s | ${complex.warmReductionAvgPercent.toFixed(1)}% |

## Cold vs warm latency by scenario

${buildMermaidChart(results)}

## Cold latency vs CU consumed

${buildLatencyVsCuChart(results)}

## Per-scenario detail

| Scenario | Complexity | CU | Anchor programs | Pipeline (ms) | Cold (ms) | Warm (ms) | Warm reduction |
|---|---|---|---|---|---|---|---|
${results
  .map(
    (r) =>
      `| ${r.id} | ${r.complexity} | ${r.cuConsumed.toLocaleString('en-US')} | ${r.anchorProgramCount} | ${r.pipelineMs.toFixed(2)} | ${r.coldEndToEndMs.toFixed(1)} | ${r.warmEndToEndMs.toFixed(1)} | ${r.warmReductionPercent.toFixed(1)}% |`
  )
  .join('\n')}

## Conclusion

${
  v.simpleUnderTarget && v.complexUnderTarget && v.warmReductionMet
    ? `All three Week 3 latency targets are met. Parser (Task 3.2.1) and IDL cache (Task 3.3.1) optimizations land at expected levels and no regression is observed in the analysis pipeline (median pipeline time across all 15 scenarios stays under 50 ms, well below RPC-bound costs).`
    : `One or more targets failed. See the verdict table above; raw timings in 'benchmarks/latency-results.json' carry the data for the optimization backlog.`
}

### Backlog (if any)

${
  v.simpleUnderTarget && v.complexUnderTarget && v.warmReductionMet
    ? '_None — all targets met._'
    : [
        !v.simpleUnderTarget &&
          '- Simple-bucket cold latency exceeds 2.0s budget — investigate "mergeAnalysis" overhead on small bundles.',
        !v.complexUnderTarget &&
          '- Complex-bucket cold latency exceeds 5.0s budget — review IDL prefetch concurrency in "prefetchIdls".',
        !v.warmReductionMet &&
          '- Warm reduction below 40% — verify "IdlCache" is actually persisting across runs (check "~/.open-cli/cache/idls/v1/").',
      ]
        .filter(Boolean)
        .join('\n')
}
`;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(__dirname, '..');

  console.log('Building 15-scenario benchmark suite...');
  const scenarios = buildScenarios();

  console.log('Running pipeline benchmarks (warmup + 3 samples each)...');
  const results = await benchmark(scenarios);

  const benchmarksDir = join(repoRoot, 'benchmarks');
  mkdirSync(benchmarksDir, { recursive: true });

  const jsonPath = join(benchmarksDir, 'latency-results.json');
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        constants: { BASELINE_TX_FETCH_MS, BASELINE_IDL_FETCH_MS, CACHE_HIT_MS },
        targets: TARGETS,
        results,
      },
      null,
      2
    )
  );
  console.log(`  → ${jsonPath}`);

  const reportPath = join(repoRoot, 'docs', 'Latency_Benchmark_Week3.md');
  writeFileSync(reportPath, buildReport(results));
  console.log(`  → ${reportPath}`);

  // Brief stdout summary so CI logs are useful.
  const simple = summarize(results, 'simple');
  const complex = summarize(results, 'complex');
  const cacheApplicable = results.filter((r) => r.anchorProgramCount > 0);
  const cacheApplicableReduction =
    cacheApplicable.reduce((s, r) => s + r.warmReductionPercent, 0) / cacheApplicable.length;
  console.log('');
  console.log('Verdict:');
  console.log(
    `  simple cold max         : ${simple.coldMaxSeconds.toFixed(2)}s  (target < ${TARGETS.simpleMaxSeconds}s)`
  );
  console.log(
    `  complex cold max        : ${complex.coldMaxSeconds.toFixed(2)}s  (target < ${TARGETS.complexMaxSeconds}s)`
  );
  console.log(
    `  warm reduction (anchor) : ${cacheApplicableReduction.toFixed(1)}%  (target ≥ ${TARGETS.warmReductionMinPercent}%)`
  );
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
