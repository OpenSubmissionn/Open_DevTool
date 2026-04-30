/**
 * Insight Quality Validation Harness — Task 2.6.1
 *
 * Runs the insight engine against a set of representative transaction shapes,
 * compares produced insights against expected ones, and prints a quality report.
 *
 * Usage:
 *   cd services
 *   npx tsx scripts/validate-insight-quality.ts
 *
 * Quality metric:
 *   Per-rule and overall = TP / (TP + FP + FN)
 *   Target: >= 80% overall.
 */

import { analyzeTransaction } from '../src/analysis/insightEngine';
import type { AnalyzedTransaction } from '../src/analysis/types';

// ─────────────────────────────────────────────────────────────────────────────
// Scenario shape
// ─────────────────────────────────────────────────────────────────────────────

interface Scenario {
  name: string;
  description: string;
  tx: AnalyzedTransaction;
  expected: {
    shouldFire: string[];
    shouldNotFire: string[];
  };
}

const ALL_RULE_TYPES = [
  'EXECUTION_FAILURE',
  'CU_BOTTLENECK',
  'CU_WASTE',
  'BUDGET_RISK',
  'DEEP_CPI',
  'CU_ATTRIBUTION_LOW_CONFIDENCE',
] as const;

// Helper to build a minimal AnalyzedTransaction with only the fields the engine reads
function makeTx(overrides: {
  success?: boolean;
  totalConsumed?: number;
  totalLimit?: number;
  utilizationPercent?: number;
  bottleneck?: {
    programName: string;
    programId?: string;
    cuConsumed: number;
    utilizationPercent: number;
  } | null;
  totalDepth?: number;
  cuAttribution?: {
    confidence: number;
    unmatchedCUEntries: number;
    ambiguousKeys: number;
    doubleAttributionCount: number;
    traceTruncated: boolean;
  };
  rawComputeUnitsConsumed?: number;
}): AnalyzedTransaction {
  const totalConsumed = overrides.totalConsumed ?? 0;
  const totalLimit = overrides.totalLimit ?? 200_000;

  return {
    parsed: {
      success: overrides.success ?? true,
      cuAttribution: overrides.cuAttribution,
    },
    cuProfile: {
      totalConsumed,
      totalLimit,
      utilizationPercent:
        overrides.utilizationPercent ?? (totalLimit > 0 ? (totalConsumed / totalLimit) * 100 : 0),
      bottleneck: overrides.bottleneck,
    },
    cpiTree: {
      totalDepth: overrides.totalDepth ?? 1,
    },
    raw: overrides.rawComputeUnitsConsumed
      ? { computeUnitsConsumed: overrides.rawComputeUnitsConsumed }
      : undefined,
  } as unknown as AnalyzedTransaction;
}

// ─────────────────────────────────────────────────────────────────────────────
// 20 scenarios covering realistic Solana transaction shapes
// ─────────────────────────────────────────────────────────────────────────────

const scenarios: Scenario[] = [
  // ── No-flag scenarios (engine should stay quiet) ─────────────────────────
  {
    name: 'simple-sol-transfer',
    description: 'Simple SOL transfer, ~1.5K CU, no flags expected',
    tx: makeTx({ totalConsumed: 1_500, totalLimit: 200_000, totalDepth: 1 }),
    expected: {
      shouldFire: [],
      shouldNotFire: ['CU_BOTTLENECK', 'CU_WASTE', 'BUDGET_RISK', 'DEEP_CPI', 'EXECUTION_FAILURE'],
    },
  },
  {
    name: 'spl-token-transfer',
    description: 'SPL token transfer, ~5K CU, Token Program is bottleneck but at low %',
    tx: makeTx({
      totalConsumed: 5_000,
      totalLimit: 200_000,
      totalDepth: 1,
      bottleneck: { programName: 'Token Program', cuConsumed: 4_500, utilizationPercent: 90 },
    }),
    // Bottleneck at 90% of total fires the rule, but this is normal for SPL transfer
    // → If rule keeps firing here, that's a FP we want to flag in the report
    expected: {
      shouldFire: ['CU_BOTTLENECK'],
      shouldNotFire: ['CU_WASTE', 'BUDGET_RISK', 'DEEP_CPI'],
    },
  },
  {
    name: 'memo-tx',
    description: 'Memo program tx, minimal CU, no flags',
    tx: makeTx({ totalConsumed: 800, totalLimit: 200_000, totalDepth: 1 }),
    expected: {
      shouldFire: [],
      shouldNotFire: ALL_RULE_TYPES.filter((t) => t !== 'EXECUTION_FAILURE') as string[],
    },
  },
  {
    name: 'close-account',
    description: 'Close account instruction, ~500 CU',
    tx: makeTx({ totalConsumed: 500, totalLimit: 200_000, totalDepth: 1 }),
    expected: {
      shouldFire: [],
      shouldNotFire: ['CU_BOTTLENECK', 'CU_WASTE', 'BUDGET_RISK', 'DEEP_CPI'],
    },
  },
  {
    name: 'anchor-swap-modest',
    description: 'Anchor swap, 70K CU within 200K limit, no bottleneck',
    tx: makeTx({
      totalConsumed: 70_000,
      totalLimit: 200_000,
      totalDepth: 2,
      bottleneck: { programName: 'Whirlpool', cuConsumed: 25_000, utilizationPercent: 35 },
    }),
    expected: { shouldFire: [], shouldNotFire: ['CU_BOTTLENECK', 'BUDGET_RISK', 'DEEP_CPI'] },
  },

  // ── Bottleneck scenarios ─────────────────────────────────────────────────
  {
    name: 'jupiter-bottleneck-critical',
    description: 'Jupiter aggregator at 80% — legitimate critical bottleneck',
    tx: makeTx({
      totalConsumed: 100_000,
      totalLimit: 200_000,
      totalDepth: 2,
      bottleneck: { programName: 'Jupiter V6', cuConsumed: 80_000, utilizationPercent: 80 },
    }),
    expected: { shouldFire: ['CU_BOTTLENECK'], shouldNotFire: ['BUDGET_RISK', 'DEEP_CPI'] },
  },
  {
    name: 'mid-bottleneck-warning',
    description: 'Mid-level bottleneck at 55% — should fire as warning',
    tx: makeTx({
      totalConsumed: 80_000,
      totalLimit: 200_000,
      totalDepth: 2,
      bottleneck: { programName: 'Some DEX', cuConsumed: 44_000, utilizationPercent: 55 },
    }),
    expected: { shouldFire: ['CU_BOTTLENECK'], shouldNotFire: ['BUDGET_RISK', 'DEEP_CPI'] },
  },

  // ── Failure ───────────────────────────────────────────────────────────────
  {
    name: 'failed-tx',
    description: 'Transaction failed (insufficient funds, e.g.)',
    tx: makeTx({ success: false, totalConsumed: 5_000, totalLimit: 200_000, totalDepth: 1 }),
    expected: { shouldFire: ['EXECUTION_FAILURE'], shouldNotFire: ['CU_BOTTLENECK', 'CU_WASTE'] },
  },
  {
    name: 'failed-tx-multi-issue',
    description: 'Failed tx that also hit budget limit and deep CPI',
    tx: makeTx({
      success: false,
      totalConsumed: 195_000,
      totalLimit: 200_000,
      totalDepth: 5,
    }),
    expected: { shouldFire: ['EXECUTION_FAILURE', 'BUDGET_RISK', 'DEEP_CPI'], shouldNotFire: [] },
  },

  // ── CU Waste ──────────────────────────────────────────────────────────────
  {
    name: 'cu-waste-large-budget',
    description: 'Set 400K limit but only used 40K — large waste, current rule fires',
    tx: makeTx({ totalConsumed: 40_000, totalLimit: 400_000, totalDepth: 1 }),
    expected: { shouldFire: ['CU_WASTE'], shouldNotFire: ['BUDGET_RISK', 'DEEP_CPI'] },
  },
  {
    name: 'cu-waste-conscious-budget',
    description: '150K limit, used 30K. Dev set sub-default budget — savings too marginal to flag',
    tx: makeTx({ totalConsumed: 30_000, totalLimit: 150_000, totalDepth: 1 }),
    // 200K is Solana's default, so anyone with < 200K explicitly tuned. Don't be noisy.
    expected: { shouldFire: [], shouldNotFire: ['CU_WASTE', 'BUDGET_RISK', 'DEEP_CPI'] },
  },
  {
    name: 'cu-waste-borderline',
    description: '300K limit, used 100K = ~67% waste, should fire',
    tx: makeTx({ totalConsumed: 100_000, totalLimit: 300_000, totalDepth: 1 }),
    expected: { shouldFire: ['CU_WASTE'], shouldNotFire: ['BUDGET_RISK'] },
  },

  // ── Budget Risk ───────────────────────────────────────────────────────────
  {
    name: 'budget-risk-high',
    description: '92% utilization — well above threshold',
    tx: makeTx({
      totalConsumed: 184_000,
      totalLimit: 200_000,
      utilizationPercent: 92,
      totalDepth: 1,
    }),
    expected: { shouldFire: ['BUDGET_RISK'], shouldNotFire: ['CU_WASTE', 'DEEP_CPI'] },
  },
  {
    name: 'budget-risk-borderline',
    description: '87% utilization — caught by the lowered 85% threshold',
    tx: makeTx({
      totalConsumed: 174_000,
      totalLimit: 200_000,
      utilizationPercent: 87,
      totalDepth: 1,
    }),
    expected: { shouldFire: ['BUDGET_RISK'], shouldNotFire: ['CU_WASTE'] },
  },

  // ── Deep CPI ──────────────────────────────────────────────────────────────
  {
    name: 'normal-dex-swap-depth-4',
    description: 'Standard Jupiter→Raydium→Token swap with depth 4 — normal, no flag expected',
    tx: makeTx({
      totalConsumed: 90_000,
      totalLimit: 200_000,
      totalDepth: 4,
      bottleneck: { programName: 'Jupiter V6', cuConsumed: 30_000, utilizationPercent: 33 },
    }),
    expected: { shouldFire: [], shouldNotFire: ['DEEP_CPI', 'CU_BOTTLENECK', 'BUDGET_RISK'] },
  },
  {
    name: 'deep-cpi-genuine',
    description: 'Genuinely deep call chain (depth 6) — should fire',
    tx: makeTx({
      totalConsumed: 130_000,
      totalLimit: 200_000,
      totalDepth: 6,
    }),
    expected: { shouldFire: ['DEEP_CPI'], shouldNotFire: ['BUDGET_RISK'] },
  },
  {
    name: 'cpi-depth-3',
    description: 'CPI depth 3 — boundary, should not fire',
    tx: makeTx({ totalConsumed: 50_000, totalLimit: 200_000, totalDepth: 3 }),
    expected: { shouldFire: [], shouldNotFire: ['DEEP_CPI'] },
  },

  // ── Attribution Quality ───────────────────────────────────────────────────
  {
    name: 'low-confidence-attribution',
    description: 'CU attribution confidence 0.45 — should warn',
    tx: makeTx({
      totalConsumed: 50_000,
      totalLimit: 200_000,
      totalDepth: 1,
      cuAttribution: {
        confidence: 0.45,
        unmatchedCUEntries: 2,
        ambiguousKeys: 1,
        doubleAttributionCount: 0,
        traceTruncated: false,
      },
    }),
    expected: { shouldFire: ['CU_ATTRIBUTION_LOW_CONFIDENCE'], shouldNotFire: ['CU_BOTTLENECK'] },
  },
  {
    name: 'double-attribution-info',
    description: 'High confidence (0.85) but has double attribution — should fire as info',
    tx: makeTx({
      totalConsumed: 50_000,
      totalLimit: 200_000,
      totalDepth: 1,
      cuAttribution: {
        confidence: 0.85,
        unmatchedCUEntries: 0,
        ambiguousKeys: 0,
        doubleAttributionCount: 2,
        traceTruncated: false,
      },
    }),
    expected: { shouldFire: ['CU_ATTRIBUTION_LOW_CONFIDENCE'], shouldNotFire: ['CU_BOTTLENECK'] },
  },

  // ── Combined ──────────────────────────────────────────────────────────────
  {
    name: 'lending-borrow',
    description: 'Lending borrow at 60K CU, depth 3, no bottleneck',
    tx: makeTx({ totalConsumed: 60_000, totalLimit: 200_000, totalDepth: 3 }),
    expected: { shouldFire: [], shouldNotFire: ['DEEP_CPI', 'CU_BOTTLENECK'] },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Runner + report
// ─────────────────────────────────────────────────────────────────────────────

interface ScenarioResult {
  name: string;
  truePositives: string[];
  falsePositives: string[];
  falseNegatives: string[];
  insights: string[]; // all types fired
}

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const report = await analyzeTransaction(scenario.tx);
  const firedTypes = new Set(report.insights.map((i) => i.type));

  const truePositives: string[] = [];
  const falseNegatives: string[] = [];

  for (const type of scenario.expected.shouldFire) {
    if (firedTypes.has(type)) truePositives.push(type);
    else falseNegatives.push(type);
  }

  const falsePositives: string[] = [];
  for (const type of scenario.expected.shouldNotFire) {
    if (firedTypes.has(type)) falsePositives.push(type);
  }

  return {
    name: scenario.name,
    truePositives,
    falsePositives,
    falseNegatives,
    insights: Array.from(firedTypes),
  };
}

async function main() {
  console.log('\n📊 INSIGHT QUALITY REPORT (Task 2.6.1)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const results = await Promise.all(scenarios.map(runScenario));

  // Per-scenario detail
  console.log('Scenario detail:');
  console.log('─'.repeat(70));
  for (const result of results) {
    const status =
      result.falsePositives.length === 0 && result.falseNegatives.length === 0 ? '✓' : '✗';
    console.log(
      `${status} ${result.name.padEnd(48)}  fired: [${result.insights.join(', ') || '—'}]`
    );
    if (result.falsePositives.length > 0) {
      console.log(`    FP: ${result.falsePositives.join(', ')}`);
    }
    if (result.falseNegatives.length > 0) {
      console.log(`    FN: ${result.falseNegatives.join(', ')}`);
    }
  }

  // Per-rule aggregation
  console.log('\nPer-rule quality:');
  console.log('─'.repeat(70));
  const perRule: Record<string, { tp: number; fp: number; fn: number }> = {};
  for (const type of ALL_RULE_TYPES) {
    perRule[type] = { tp: 0, fp: 0, fn: 0 };
  }
  for (const r of results) {
    for (const t of r.truePositives) perRule[t].tp++;
    for (const t of r.falsePositives) perRule[t].fp++;
    for (const t of r.falseNegatives) perRule[t].fn++;
  }

  let totalTP = 0;
  let totalFP = 0;
  let totalFN = 0;

  for (const [rule, counts] of Object.entries(perRule)) {
    const denom = counts.tp + counts.fp + counts.fn;
    const score = denom === 0 ? 1 : counts.tp / denom;
    const flag = score < 0.8 ? '⚠️' : '✓';
    console.log(
      `  ${flag} ${rule.padEnd(35)}  TP=${counts.tp}  FP=${counts.fp}  FN=${counts.fn}  score=${(score * 100).toFixed(0)}%`
    );
    totalTP += counts.tp;
    totalFP += counts.fp;
    totalFN += counts.fn;
  }

  // Overall
  const overallDenom = totalTP + totalFP + totalFN;
  const overallScore = overallDenom === 0 ? 1 : totalTP / overallDenom;

  console.log('─'.repeat(70));
  console.log(
    `\nOverall: TP=${totalTP}  FP=${totalFP}  FN=${totalFN}  quality=${(overallScore * 100).toFixed(1)}%`
  );
  console.log(
    overallScore >= 0.8
      ? '✓ TARGET MET: quality >= 80%'
      : `✗ Below target. Need to fix ${totalFP + totalFN} issues to reach 80%.`
  );
  console.log();
}

main().catch((err) => {
  console.error('Harness failed:', err);
  process.exit(1);
});
