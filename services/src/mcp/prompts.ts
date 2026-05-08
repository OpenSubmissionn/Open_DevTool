import type { SolanaFramework } from '../analysis/frameworkComparator.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type OperationComplexity = 'simple' | 'medium' | 'complex';

export interface OptimizationExample {
  /** Anti-pattern or pattern name */
  pattern: string;
  /** Estimated CU saving when applying the alternative (negative means added cost) */
  cuSaving: number;
  /** What to do instead */
  alternative: string;
  /** Risks to be aware of */
  risk?: string;
  /** Extra context or reasoning */
  notes?: string;
}

export interface TradeOff {
  /** The two competing concerns, e.g. "security vs performance" */
  axis: string;
  /** Concrete example, including CU numbers when possible */
  example: string;
  /** Recommendation when in doubt */
  recommendation: string;
}

export interface CuReference {
  operation: string;
  framework: SolanaFramework;
  estimatedCU: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface PromptContext {
  detectedFramework: SolanaFramework;
  operationComplexity: OperationComplexity;
  optimizationExamples: OptimizationExample[];
  tradeOffs: TradeOff[];
  cuReferences: CuReference[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-framework optimization examples with concrete CU numbers.
 * Sourced from Anchor Book best practices, Steel docs, and empirical benchmarks.
 */
export const FRAMEWORK_OPTIMIZATION_EXAMPLES: Record<SolanaFramework, OptimizationExample[]> = {
  anchor: [
    {
      pattern: 'Recalculating PDA bumps with find_program_address on every call',
      cuSaving: 1500,
      alternative:
        'Store the canonical bump in the account at init and reuse via seeds + bump constraint',
      notes: 'find_program_address iterates 1..255 to find a valid bump; storing it skips the loop',
    },
    {
      pattern: 'Using init_if_needed',
      cuSaving: 0,
      alternative: 'Separate init and update instructions; gate access with explicit checks',
      risk: 'init_if_needed enables reinitialization attacks',
      notes: 'No CU saving, but eliminates a known security hole',
    },
    {
      pattern: 'Excessive msg!() calls in instruction handlers',
      cuSaving: 100,
      alternative: 'Feature-gate debug logs with #[cfg(feature = "debug")]',
      notes: 'Each msg!() costs roughly 100 CU plus serialization overhead',
    },
    {
      pattern: 'Account validation duplicated inside the handler body',
      cuSaving: 200,
      alternative:
        'Express constraints in #[derive(Accounts)] — Anchor optimizes the validation order',
    },
  ],
  steel: [
    {
      pattern: 'Manual account deserialization with bytemuck inside the handler',
      cuSaving: 500,
      alternative: 'Use Steel zero-copy AccountInfo unpacking helpers',
    },
    {
      pattern: 'Heap allocations inside the instruction handler',
      cuSaving: 300,
      alternative: 'Stack-allocated arrays with const sizes',
      notes: 'Steel emphasizes no_std + no_alloc patterns',
    },
  ],
  native: [
    {
      pattern: 'unwrap() / expect() in instruction code',
      cuSaving: 0,
      alternative: 'Return ProgramError variants explicitly',
      risk: 'unwrap() panics consume CU and surface non-deterministic errors',
    },
    {
      pattern: 'Unchecked arithmetic (a + b, a - b, a * b)',
      cuSaving: -30,
      alternative: 'Use checked_add / checked_sub / checked_mul',
      risk: 'Unchecked arithmetic can cause silent overflow leading to drained funds',
      notes: 'The ~30 CU added per checked op is negligible compared to the financial risk',
    },
    {
      pattern: 'Borsh deserialization for hot data structures',
      cuSaving: 800,
      alternative: 'Use #[repr(C)] structs with zero-copy reads via bytemuck',
    },
  ],
  unknown: [],
};

/**
 * Classifies operation complexity by total CU consumed.
 * Bands chosen to match common Solana operation tiers.
 */
export const OPERATION_COMPLEXITY: Record<
  OperationComplexity,
  { maxCU: number; examples: string[] }
> = {
  simple: {
    maxCU: 5_000,
    examples: ['SOL transfer', 'create account', 'close account', 'memo'],
  },
  medium: {
    maxCU: 50_000,
    examples: ['SPL token transfer', 'mint', 'burn', 'simple swap'],
  },
  complex: {
    maxCU: 200_000,
    examples: [
      'multi-hop swap',
      'deep CPI chain (>5 levels)',
      'liquidation',
      'NFT marketplace listing',
    ],
  },
};

/**
 * Common trade-offs Solana developers face.
 * Each item grounds the discussion with a CU number.
 */
export const TRADE_OFFS: TradeOff[] = [
  {
    axis: 'security vs performance',
    example:
      'checked_add (~30 CU) vs unchecked_add (0 CU). Skipping checks to save 30 CU is rarely worth the silent-overflow risk.',
    recommendation:
      'Always use checked arithmetic. The CU cost is negligible vs the financial risk.',
  },
  {
    axis: 'composability vs speed',
    example:
      'CPI to SPL Token (~1500 CU per call) vs inlining transfer logic (0 CU but reinvents the trust model).',
    recommendation: 'Use CPI for standard operations. Only inline when the CU budget is critical.',
  },
  {
    axis: 'developer ergonomics vs runtime cost',
    example:
      'Anchor #[derive(Accounts)] (~500 CU validation overhead) vs hand-rolled native validation (faster but error-prone).',
    recommendation: 'Use Anchor for non-critical paths. Move to native + Steel for hot code paths.',
  },
  {
    axis: 'flexibility vs determinism',
    example:
      'init_if_needed (~2500 CU, flexible) vs split init/update (~1200 CU total, deterministic).',
    recommendation:
      'Always prefer split init/update. init_if_needed is a known reinitialization-attack vector.',
  },
  {
    axis: 'PDA convenience vs CU cost',
    example: 'find_program_address per call (~1500 CU) vs storing canonical bump (~50 CU lookup).',
    recommendation: 'Store the bump at init. The 30x CU saving compounds across instructions.',
  },
];

/**
 * Inline CU references mirroring services/src/data/framework-benchmarks.json.
 * Kept inline because the project does not enable resolveJsonModule.
 */
export const CU_REFERENCES: CuReference[] = [
  { operation: 'transfer', framework: 'native', estimatedCU: 500, confidence: 'high' },
  { operation: 'transfer', framework: 'anchor', estimatedCU: 1500, confidence: 'medium' },
  { operation: 'create-account', framework: 'native', estimatedCU: 1000, confidence: 'high' },
  { operation: 'create-account', framework: 'anchor', estimatedCU: 2500, confidence: 'medium' },
  { operation: 'swap', framework: 'steel', estimatedCU: 40_000, confidence: 'low' },
  { operation: 'swap', framework: 'anchor', estimatedCU: 50_000, confidence: 'medium' },
  { operation: 'swap', framework: 'native', estimatedCU: 30_000, confidence: 'medium' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classifies a transaction's CU consumption into simple / medium / complex.
 */
export function classifyComplexity(cuConsumed: number): OperationComplexity {
  if (cuConsumed <= OPERATION_COMPLEXITY.simple.maxCU) return 'simple';
  if (cuConsumed <= OPERATION_COMPLEXITY.medium.maxCU) return 'medium';
  return 'complex';
}

/**
 * Builds the enriched prompt context to send to the MCP service.
 *
 * Picks framework-relevant examples, classifies operation complexity, and
 * surfaces the trade-offs and CU references that apply to this transaction.
 */
export function buildPromptContext(params: {
  framework: SolanaFramework;
  cuConsumed: number;
  operationHint?: string;
}): PromptContext {
  const { framework, cuConsumed, operationHint } = params;
  const complexity = classifyComplexity(cuConsumed);

  // Pick framework-specific examples; for unknown framework, fall back to native (most general).
  const examples =
    framework === 'unknown'
      ? FRAMEWORK_OPTIMIZATION_EXAMPLES.native
      : FRAMEWORK_OPTIMIZATION_EXAMPLES[framework];

  // Pick CU references relevant to the operation hint when provided,
  // otherwise return references for the detected framework + native baseline.
  const cuRefs = operationHint
    ? CU_REFERENCES.filter((ref) => ref.operation === operationHint)
    : CU_REFERENCES.filter((ref) => ref.framework === framework || ref.framework === 'native');

  return {
    detectedFramework: framework,
    operationComplexity: complexity,
    optimizationExamples: examples,
    tradeOffs: TRADE_OFFS,
    cuReferences: cuRefs,
  };
}
