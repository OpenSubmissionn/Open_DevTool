# AI Insights

## Introduction

OPEN's insight layer combines two sources of advice into a single ranked list of recommendations a developer sees after running `open tx <signature>`:

1. **Rule-based insights.** Deterministic checks computed from the analyzed transaction (`CU_BOTTLENECK`, `CU_WASTE`, `BUDGET_RISK`, `EXECUTION_FAILURE`, etc.). These never call out to a network and are stable across runs.
2. **AI-generated insights.** A prompt sent to a Claude / Groq provider through the MCP layer. The prompt embeds a curated knowledge base of Solana CU-optimisation techniques so the model's output stays grounded in real numbers rather than free-form prose.

When a rule and the AI provider both flag the same issue, the engine merges them into a single `hybrid` insight — the strongest signal we can produce.

This document covers three responsibilities of that layer:

- **Part A — Prompt knowledge base sources.** What the prompt asserts as fact, and which upstream documents back each claim.
- **Part B — Insight ranking logic.** How the engine orders the final list so the top three insights a user sees are always the most actionable for their transaction.
- **Part C — MCP wire format.** The exact `MCPPayload` shape the engine sends to the external MCP service, including the optional enriched-context fields and the example payload.

---

## Part A — Prompt knowledge base sources

The prompt sent to the LLM (in `services/src/mcp/anthropic.ts:buildPrompt`) embeds a curated knowledge base of Solana CU-optimisation techniques. This section lists the upstream sources used to build that knowledge base so anyone can verify, extend, or correct the numbers and patterns we cite.

When the prompt changes, this section must be updated with the source backing the new claim. Numbers without a source are unsafe to ship.

### Anchor framework

| Claim in prompt | Source |
|---|---|
| PDA bump caching saves ~1,500 CU per access | Anchor Book — *PDA accounts*, https://www.anchor-lang.com/docs/pdas |
| `has_one` / `constraint` cheaper than manual checks | Anchor Book — *Account constraints*, https://www.anchor-lang.com/docs/account-constraints |
| `LazyAccount` saves ~5,000 CU on large accounts | Anchor 0.30 release notes, https://github.com/coral-xyz/anchor/releases/tag/v0.30.0 |
| `init_if_needed` enables reinit attacks | Sealevel attacks reference — *Reinitialization*, https://github.com/coral-xyz/sealevel-attacks |
| `.reload()?` required after CPI mutation | Anchor Book — *CPI*, https://www.anchor-lang.com/docs/cross-program-invocations |
| `msg!()` costs 150–500 CU | Solana Program Logging benchmarks, https://solana.com/docs/programs/debugging |

### Compute budget

| Claim in prompt | Source |
|---|---|
| Default 200k CU / ix, 1.4M CU / tx | Solana docs — *Transaction fees and compute budget*, https://solana.com/docs/core/fees |
| Simulated CU + 10–20% buffer | Helius — *How to optimise compute usage on Solana*, https://www.helius.dev/blog/solana-compute-units |
| `getRecentPrioritizationFees` for percentile pricing | Solana RPC API, https://solana.com/docs/rpc/http/getrecentprioritizationfees |

### SPL Token / Token-2022

| Claim in prompt | Source |
|---|---|
| `transfer` ~3,500 CU; `transferChecked` ~4,500 CU | Mollusk benchmarks of SPL Token v4.0 |
| ATA creation ~25,000 CU | Empirical via Mollusk + reproducible in `services/src/data/framework-benchmarks.json` |
| Token-2022 transfer hooks add 5–20k CU | Solana docs — *Transfer hook extension*, https://solana.com/developers/guides/token-extensions/transfer-hook |

### CPI patterns

| Claim in prompt | Source |
|---|---|
| ~1,000 CU framing per CPI | Anchor Book — *CPI overhead* + Solana runtime source, https://github.com/anza-xyz/agave |
| Batching reduces overhead | General principle — measurable in repo's `bench:latency` |
| Validate target program ID before invoke | Solana security best practices, https://github.com/solana-developers/program-examples |

### DEX-specific

| Claim in prompt | Source |
|---|---|
| Jupiter v6: prefer `exactIn`, cap `maxAccounts` | Jupiter docs — *Swap API*, https://station.jup.ag/docs/apis/swap-api |
| Whirlpool: tick crossings ~5,000 CU each | Orca docs — *Whirlpool architecture*, https://orca-so.github.io/whirlpools/ |
| Raydium AMM v4: pre-validate pool state | Raydium SDK examples, https://github.com/raydium-io/raydium-sdk |

### Reliability

| Claim in prompt | Source |
|---|---|
| Always simulate before send | Helius — *How to land transactions*, https://www.helius.dev/blog/how-to-land-transactions-on-solana |
| Don't retry terminal errors | Solana RPC error catalog, https://docs.solana.com/developing/clients/jsonrpc-api |
| Durable nonces bypass blockhash expiry | Solana docs — *Durable transaction nonces*, https://solana.com/developers/courses/offline-transactions/durable-nonces |

### Native Rust / Pinocchio

| Claim in prompt | Source |
|---|---|
| Pinocchio ~80–95% CU reduction vs Anchor | Pinocchio README + benchmarks, https://github.com/anza-xyz/pinocchio |
| `create_program_address` ~50 CU vs `find_program_address` ~1.5–10k | Solana program tests, https://github.com/anza-xyz/agave/tree/master/program-runtime |

### Maintenance

When upgrading the prompt:

1. Add the new claim to `services/src/mcp/anthropic.ts:buildPrompt`.
2. Add a row to the appropriate section above with a primary source URL.
3. If the claim depends on benchmark numbers, prefer:
   - Mollusk runs from this repo (`bench:latency`)
   - Solana Foundation docs
   - Helius / Triton / official protocol docs
4. Avoid Twitter/Discord-only sources — they rot.
5. When a number is contested, pick the lower bound and cite both refs.

---

## Part B — Insight ranking logic

This section explains how the OPEN CLI orders the insights it produces for each transaction. The goal of the ranking is simple: the top 3 insights a user sees should always be the most actionable ones for their transaction.

The implementation lives in `scoreInsight()` at `services/src/analysis/insightEngine.ts`. The function is pure and deterministic, which keeps snapshot tests stable across machines.

### Why a ranking change was needed

Until task 2.13.1 the engine sorted by severity first and CU savings as tiebreak. That worked while we only had three or four rules, but after the Week 2 expansion we found two recurring problems on real fixtures:

1. **Diagnostic noise outranking actionable advice.** The `CU_ATTRIBUTION_LOW_CONFIDENCE` insight is `severity: warning`, but it reports something about our tool's confidence, not something the user can fix in their program. With pure severity sorting it would push a `CU_WASTE` `info` insight (which has a concrete savings number) below it.

2. **Hybrid insights buried behind solo rules.** When a rule and the MCP provider both flag the same issue we merge them into a `hybrid` insight (strongest signal we can produce). The old sort treated `hybrid` and `rule` identically.

After consolidating the insight history from 40+ transactions executed in Days 12 to 15, both patterns repeat enough to justify rewriting the sort.

### How the score is built

`scoreInsight(insight)` returns a number; the engine sorts descending. The score is the sum of the components below.

#### 1. Severity baseline

| Severity | Points |
|---|---|
| `critical` | 100 |
| `warning` | 50 |
| `info` | 10 |

A critical insight will always outrank a warning, and a warning a non-tagged info, before any of the other adjustments kick in.

#### 2. Actionability bonuses

| Signal | Points |
|---|---|
| `codeSuggestions.length > 0` | +20 |
| `estimatedCUSavings > 0` | +15 |
| `programId` set (knows where to look) | +5 |

These are the strongest signals that the user can take an immediate action. A code suggestion is the most concrete deliverable, so it gets the largest bonus.

#### 3. Source weight

| Source | Points |
|---|---|
| `hybrid` (rule + MCP agree) | +20 |
| `mcp` (AI-only) | +10 |
| `rule` | 0 |

`hybrid` is the strongest because two independent layers reached the same conclusion. `mcp` alone is weighted lower because the MCP provider can hallucinate; if the rule layer disagrees, the merge falls through and we keep both insights separately.

#### 4. Tag intent adjustments

| Tag | Points |
|---|---|
| `failure` | +15 |
| `cost` or `optimization` | +10 |
| `risk` | +5 |
| `diagnostics` or `quality` | -25 |

The negative weight on diagnostics is deliberate. Insights tagged `quality` or `diagnostics` describe the state of OPEN itself, not the user's transaction. They still appear in the report, but never ahead of an insight that gives the user something to act on.

#### 5. Savings magnitude tiebreak

When two insights are otherwise tied, the one whose `estimatedCUSavings` represents a larger win goes first. The bonus is `min(10, log10(savings + 1))` so a 5x bigger saving does not dominate the ranking; it just breaks ties.

### Worked examples

#### Example A — failed transaction with high CPI depth

Rules that fire: `EXECUTION_FAILURE` (critical, tag `failure`), `BUDGET_RISK` (warning, tag `risk`), `DEEP_CPI` (info, tag `complexity`).

| Insight | Score | Breakdown |
|---|---|---|
| EXECUTION_FAILURE | 115 | 100 (critical) + 15 (failure tag) |
| BUDGET_RISK | 55 | 50 (warning) + 5 (risk tag) |
| DEEP_CPI | 10 | 10 (info) |

Final order: `EXECUTION_FAILURE`, `BUDGET_RISK`, `DEEP_CPI`. The first thing the user sees is the failure, then the risk that the next attempt also fails, then a structural note.

#### Example B — cost insight versus diagnostic warning

Rules that fire: `CU_WASTE` (info, tags `cost` and `optimization`, savings 350,000), `CU_ATTRIBUTION_LOW_CONFIDENCE` (warning, tags `quality` and `diagnostics`).

| Insight | Score | Breakdown |
|---|---|---|
| CU_WASTE | 40.5 | 10 (info) + 15 (savings) + 10 (cost/optimization) + 5.5 (log10 of savings) |
| CU_ATTRIBUTION_LOW_CONFIDENCE | 25 | 50 (warning) - 25 (diagnostics/quality) |

Final order: `CU_WASTE` first, even though it is `info`. The diagnostic is still in the report so power users can inspect it, but it is no longer hiding the actionable savings recommendation.

#### Example C — hybrid bottleneck with code suggestions

Suppose the rule layer fires `CU_BOTTLENECK` (warning, `programId` set, tag `performance`) and the MCP provider also returns a `CU_BOTTLENECK` insight with two code suggestions. They merge into a single `hybrid` insight.

Score: 50 (warning) + 5 (programId) + 20 (codeSuggestions) + 20 (hybrid) = 95.

This is still below the 100 floor of any critical insight, which is the correct behaviour: a non-critical bottleneck should never push a failure or hard-critical issue off the top of the list.

### Reduced-confidence rules

The task also asked us to reduce confidence on rules with high false-positive rates. Two changes capture this without requiring per-rule code edits:

- The negative weight on `diagnostics` and `quality` tags effectively demotes `CU_ATTRIBUTION_LOW_CONFIDENCE` whenever a more actionable insight exists. The rule still fires (we want the data available for power users); it just stops competing for the top of the list.
- `CU_WASTE` only fires when waste is greater than 50% AND the requested limit exceeded 200,000 CU. Below that, the optimisation is too small to be worth the user's attention. This threshold is unchanged from task 2.6.1, but the new score gives `CU_WASTE` enough lift (savings + cost tag) to consistently appear in the top three when it does fire.

### How to validate

Two automated checks back this up:

1. `scoreInsight` is exported from `insightEngine.ts` and unit-tested directly in `services/tests/analysis/insightEngine.test.ts`. The tests cover severity ordering, source ordering, the actionable-vs-diagnostic case, and a top-3 mix on a realistic mock transaction.
2. The existing ordering tests (`insights[0] === 'EXECUTION_FAILURE'`, `insights[1] === 'BUDGET_RISK'`) still pass, which confirms backward compatibility for the canonical "critical first" expectation.

To re-run just the ranking suite:

```bash
npm run test -- --run services/tests/analysis/insightEngine.test.ts
```

### When to revisit

Recompute the weights if any of the following becomes true:

- A new insight type joins the engine and does not slot cleanly into one of the four severity / source / actionability / tag axes.
- User feedback consistently shows a specific insight type at position 1 that is not actionable, suggesting the bonus stack is wrong.
- The MCP provider's false-positive rate changes materially in either direction (currently we trust hybrid above mcp above rule).

The score is a single function, so future tuning should be a small, targeted change with a test for each new boundary.

---

## Part C — MCP wire format

Wire-format reference for the `MCPPayload` sent from the OPEN CLI to the external MCP service.

### Overview

The MCP service receives a JSON document describing one analysed transaction and replies with a list of optimisation suggestions. The payload is split into:

- **Core fields** — required, present in every request
- **Enriched context fields** — optional, populated when the engine has the data

Backwards compatibility: every enriched field is optional. Older MCP service versions can ignore them safely.

### Top-level shape

```ts
interface MCPPayload {
  // Core (always present)
  bottleneckProgram: string;
  instructionName: string;
  cuConsumed: number;
  cpiDepth: number;
  accountDiffSummary: string;
  parsedErrors: string[];
  logSummary: string;

  // Enriched context (Task 2.7.1, optional)
  cpiTreeStructure?: CpiTreeStructure;
  bottleneckNode?: BottleneckNodeDetail;
  detailedAccountDiffs?: DetailedAccountDiff[];
  similarPatterns?: SimilarPattern[];
}
```

### Core fields

| Field | Type | Description |
|---|---|---|
| `bottleneckProgram` | `string` | Friendly name of the program that consumed the most CU. `"Unknown"` when no bottleneck identified. |
| `instructionName` | `string` | Synthetic name for the dominant instruction, e.g. `"Jupiter V6 instruction"`. |
| `cuConsumed` | `number` | Total CU consumed by the transaction. |
| `cpiDepth` | `number` | Maximum depth of the CPI call tree. |
| `accountDiffSummary` | `string` | Compact one-line summary of SOL deltas across affected accounts. |
| `parsedErrors` | `string[]` | Error messages extracted from the transaction logs. Empty array on success. |
| `logSummary` | `string` | One-line summary, e.g. `"23 log entries, 0 errors"`. |

### Enriched context fields

#### `cpiTreeStructure`

Aggregate metrics on the shape of the CPI call tree. Helps the MCP service reason about complexity beyond raw depth.

```ts
interface CpiTreeStructure {
  depth: number;
  totalNodes: number;
  branchingFactor: number; // avg children per non-leaf node
  uniquePrograms: number;
}
```

| Field | Notes |
|---|---|
| `depth` | Same as top-level `cpiDepth` (mirrored for convenience). |
| `totalNodes` | Count of nodes (root + every child, recursively). |
| `branchingFactor` | `1.0` means a linear chain; `>1.0` means fan-out. Helps detect if depth is from chained CPIs (linear) vs many sub-calls (branching). |
| `uniquePrograms` | Distinct program IDs invoked across the whole tree. |

#### `bottleneckNode`

Detailed breakdown of the program that consumed the most CU. More structured than the top-level `bottleneckProgram` string.

```ts
interface BottleneckNodeDetail {
  programId: string;
  programName: string;
  cuConsumed: number;
  utilizationPercent: number;
  status?: 'success' | 'failed';
  depth?: number;
}
```

Populated when `tx.cuProfile.bottleneck` is non-null. Omitted otherwise.

#### `detailedAccountDiffs`

Per-account state changes with full role information and token deltas. The core `accountDiffSummary` is human-readable; this field is machine-readable.

```ts
interface DetailedAccountDiff {
  pubkey: string;
  pubkeyShort: string;          // first 8 chars
  role: 'signer' | 'writable' | 'readonly';
  solDelta: number;
  tokenDeltas: Array<{
    mint: string;
    symbol?: string;
    uiDelta: number;
  }>;
}
```

| Use case | Example |
|---|---|
| Identify the fee payer | `role === 'signer' && solDelta < 0` |
| Track token movements | inspect `tokenDeltas` per account |
| Flag suspicious changes | unverified mint with large `uiDelta` |

#### `similarPatterns`

Reference to known optimisation patterns relevant to the bottleneck program. Populated via a name lookup; up to 3 patterns returned.

```ts
interface SimilarPattern {
  programName: string;
  pattern: string;        // short description of the typical pattern
  optimization: string;   // the recommended optimisation
}
```

The current pattern set covers Jupiter V6, Jupiter Aggregator, Token Program, Raydium AMM v4, Whirlpool, Magic Eden, and Marinade. Lookup is case-insensitive with substring fallback (e.g. `"Jupiter"` matches both Jupiter V6 and Aggregator).

Returns `[]` when the bottleneck program is `"Unknown"` or has no known pattern.

### Example payload

```json
{
  "bottleneckProgram": "Jupiter V6",
  "instructionName": "Jupiter V6 instruction",
  "cuConsumed": 145000,
  "cpiDepth": 4,
  "accountDiffSummary": "9xQe...: -0.5 SOL, AaB1...: +0 SOL",
  "parsedErrors": [],
  "logSummary": "47 log entries, 0 errors",
  "cpiTreeStructure": {
    "depth": 4,
    "totalNodes": 7,
    "branchingFactor": 1.5,
    "uniquePrograms": 4
  },
  "bottleneckNode": {
    "programId": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    "programName": "Jupiter V6",
    "cuConsumed": 95000,
    "utilizationPercent": 65.5,
    "status": "success"
  },
  "detailedAccountDiffs": [
    {
      "pubkey": "9xQe2C8...full pubkey...",
      "pubkeyShort": "9xQe2C8m",
      "role": "signer",
      "solDelta": -0.5,
      "tokenDeltas": [
        { "mint": "EPjFWdd5...", "symbol": "USDC", "uiDelta": 1234.56 }
      ]
    }
  ],
  "similarPatterns": [
    {
      "programName": "Jupiter V6",
      "pattern": "Aggregator swap with token program CPIs",
      "optimization": "Use exact_in mode and prefer routes with fewer hops to reduce CU and slippage"
    }
  ]
}
```

### Versioning policy

- Adding optional fields is non-breaking.
- Renaming or removing fields is breaking — bump the schema version and coordinate with the MCP service.
- Field types are stable: enums (e.g. `role`) only grow, never shrink.

### Related code

| File | Role |
|---|---|
| `services/src/mcp/client.ts` | `MCPPayload` interface + HTTP client |
| `services/src/mcp/mcpInsightProvider.ts` | `buildMcpPayload()` — assembly |
| `services/tests/mcp/mcpInsightProvider.test.ts` | Wire-shape tests |

---

## Conclusion

The three parts of this document describe the same pipeline at different altitudes: Part A says **what** the AI is allowed to claim, Part B says **which** of those claims (and which rules) the user sees first, and Part C says **how** that information is shipped to and from the external MCP service. Keeping all three in sync matters because a high-quality but mis-ranked insight is invisible, a well-ranked but ungrounded insight is worse than no insight at all, and either of those is moot if the wire format silently drops the field that carried it.

If you change any layer, expect to touch the others within the same change set:

- Adding a new rule or MCP-side claim → think about its severity, tags, and actionability bonuses (Part B), and add a test in `insightEngine.test.ts` covering the boundary case.
- Bumping a number in the prompt → add the source row to Part A so the next reviewer can verify the figure.
- Adding a new enriched-context field → bump the example in Part C, add the field to `client.ts`, and update the wire-shape tests.

The full architectural context — how the insight engine sits in the wider pipeline — is in `Architecture_OPEN.md`.
