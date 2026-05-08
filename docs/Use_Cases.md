# OPEN: Use Cases & Workflows

This guide walks through the four most common reasons people reach for the
OPEN CLI: auditing CU spending, optimising a program, investigating a
failed transaction, and comparing frameworks. Each case is a copy-pasteable
walkthrough that takes a real signature and tells you how to read the
output.

Two extra workflows at the end cover anomaly investigation and batch
portfolio analysis, which combine the building blocks above.

All commands assume you are at the repo root. If you have not run the
project before, see [`README.md`](../README.md) and
[`Troubleshooting.md`](Troubleshooting.md) first.

## Table of Contents

1. [Audit CU spending on a transaction](#1-audit-cu-spending-on-a-transaction)
2. [Optimise a program](#2-optimise-a-program)
3. [Investigate a failed transaction](#3-investigate-a-failed-transaction)
4. [Compare frameworks for a workload](#4-compare-frameworks-for-a-workload)
5. [Anomaly investigation workflow](#5-anomaly-investigation-workflow)
6. [Batch portfolio analysis workflow](#6-batch-portfolio-analysis-workflow)

## 1. Audit CU spending on a transaction

**When to use this:** you suspect a transaction is more expensive than it
should be, or you are picking which calls to optimise first in a busy
program.

**Command**

```bash
opendev tx <signature> --network mainnet --verbose
```

The `--verbose` flag prints per-stage timing and IDL cache metrics so you
can also tell whether the cost lives in your program or in our pipeline.

**What to look for in the output**

| Section | What it tells you |
|---|---|
| `Transaction Summary` | total CU consumed and the requested limit |
| `CPI Tree` | which programs consumed how much CU, indented by call depth |
| `Insights` | top issues in actionability order, see [Insight_Ranking_Logic.md](Insight_Ranking_Logic.md) |
| `Cost Breakdown` | fee in SOL and USD, plus per-transfer USD impact |

**Reading the insights**

- `CU_BOTTLENECK` (critical when the program ate >70% of the CU): focus
  optimisation effort here first. The `programId` field tells you which
  program to open.
- `CU_WASTE` (info, with a concrete savings number): your compute budget
  request is bigger than what you actually used. Lower the request to
  reduce priority fee waste. The `recommendation` includes the suggested
  limit.
- `BUDGET_RISK` (warning, fires above 85% utilisation): you are close to
  the cap. Either bump the budget by ~15% or trim instruction count.

**Example action plan**

1. If `CU_BOTTLENECK` fires and points at your own program: open the CPI
   Tree, find the indented child that ate most CU, and optimise that
   instruction.
2. If `CU_BOTTLENECK` fires and points at a third party program (Jupiter,
   Orca, Raydium): the cost is structural. Consider whether you actually
   need that route, or whether a simpler swap path is enough.
3. If only `CU_WASTE` fires: no code change needed. Just lower
   `ComputeBudgetProgram.setComputeUnitLimit(...)` to the suggested value.

## 2. Optimise a program

**When to use this:** you have a program in production, OPEN flagged a
bottleneck, and you want concrete suggestions instead of guesses.

**Command**

```bash
opendev tx <signature> --network mainnet --json > tx-analysis.json
```

JSON output is the right format for optimisation work because it includes
the full MCP suggestions, the framework comparator deltas, and every
account diff with byte-level changes.

**Step by step**

1. **Confirm the bottleneck is yours.** In `cpiTree`, walk the `root` array
   and find the program with the highest `cuConsumed`. If its `programId`
   is yours, continue. If it is a DEX or aggregator, see use case 1 step 2.
2. **Read the MCP suggestions.** In `insights`, find any entry with
   `source: "hybrid"` or `source: "mcp"`. The `codeSuggestions` array (when
   present) contains specific patterns to apply, with a justification for
   each. `hybrid` means the rule layer and the AI agreed, which is the
   strongest signal.
3. **Cross-reference the framework comparator.** The `frameworkComparison`
   block tells you the estimated CU delta if you ported the program to a
   different framework (Anchor to Steel, etc). If the delta is large and
   your program is hot, that may justify a port; if the delta is small,
   stay where you are and focus on inner loops.
4. **Apply one change at a time.** Re-run the command on the next
   transaction after deploy and confirm the bottleneck shrank. Optimising
   in batches makes attribution impossible.

**Tip:** if you do not want the MCP layer (faster, deterministic), unset
`MCP_ENDPOINT_URL`. The pipeline degrades to rule-only insights and your
output stays reproducible across machines.

## 3. Investigate a failed transaction

**When to use this:** a transaction landed with `err: ...`, a user is
reporting a stuck swap, or you are debugging why a deploy script reverts.

**Command**

```bash
opendev tx <signature> --network <mainnet|devnet> --verbose
```

**Step by step**

1. **Confirm the failure surface.** The first `Insight` should be
   `EXECUTION_FAILURE` with `severity: critical`. If it is missing, the
   transaction actually succeeded and the `err` you saw was someone else's
   confusion.
2. **Walk the CPI Tree top-down.** Failed nodes are marked
   `status: "failed"`. The first failed node from the top is where the
   chain broke; everything under it inherited the failure.
3. **Check the parsed instruction at that node.** The renderer shows the
   instruction name (after IDL decoding) and the accounts passed to it.
   Common failure causes you can read directly:
   - Account is `writable` but should not be, or vice versa: program
     constraint violation.
   - Account balance went negative in the diff: insufficient funds before
     the transfer.
   - Account is missing a signer flag: the wallet did not sign that
     instruction.
4. **If the failure is mid-CPI, follow the chain.** A program returned an
   error to its caller, which then aborted. The Insights `CU_BOTTLENECK`
   entry, when present, often points at the program that returned the
   error code.
5. **If you cannot reproduce on devnet:** an account state difference is
   the most common cause. Run the same command with `--network devnet`
   against a similar simulated transaction and diff the
   `accountDiffs` blocks.

**Common failures and where to look**

| Failure pattern | Where to read it |
|---|---|
| Insufficient SOL for fee | `accountDiffs` for the fee payer, `solDelta` is negative |
| Wrong PDA | parsed instruction shows an unexpected account address at the seed-derived position |
| Account already initialised | instruction returns custom error 0, visible in CPI Tree leaf |
| CPI depth exceeded | `DEEP_CPI` insight fires (depth > 4), reorganise call chain |

## 4. Compare frameworks for a workload

**When to use this:** you are deciding between Anchor, Steel, native, or
similar for a new program, and want a CU baseline against a real workload
instead of a synthetic benchmark.

**Command**

```bash
opendev tx <signature> --network mainnet --json | jq '.frameworkComparison'
```

`jq` is optional; without it just open the file and find the
`frameworkComparison` block.

**What you get**

The block contains, per candidate framework, an estimated CU consumption
for the same workload, plus the delta against the observed framework. The
estimates use the per-framework baselines defined in
`benchmarks/latency-results.json` and the program's CPI shape.

**How to interpret it**

- A positive delta means you are spending more CU than the candidate would.
  If the delta is bigger than ~10% of total CU and the program is hot,
  that is a real signal.
- A negative delta means the alternative would be more expensive. Stay put.
- A near-zero delta (< 5%) is noise; do not port a program for that.

**Sanity check before porting**

Run the command on three different transactions of the same program type
(e.g. three Jupiter swaps with different routes). If the delta is
consistent across all three, it is structural. If it bounces around, the
delta is workload-dependent and a port may not help.

## 5. Anomaly investigation workflow

The anomaly detector lives in `services/src/analysis/anomalyDetector.ts`
and currently detects three patterns: `spam`, `mev-like`, and
`nondeterministic`. The CLI does not yet render an `Anomalies` section in
its terminal output (that wiring lands with task 2.9.1); for now you can
either consume the detector programmatically or use the indirect signals
described below.

### Programmatic use today

```ts
import { detectAnomalies } from '@open/services'
import { fetchTransaction, parseTransaction } from '@open/services'

const bundle = await fetchTransaction(signature, 'mainnet')
const parsed = await parseTransaction(bundle)
const report = detectAnomalies(bundle, parsed.transfers ?? [])

if (report.hasHighSeverity) {
  for (const anomaly of report.anomalies) {
    console.log(anomaly.type, anomaly.severity, anomaly.description)
  }
}
```

### What to do per anomaly type

**`spam` anomaly fires (high severity by default)**

The detector flagged a transfer of an unverified mint at suspicious
volume. Steps:

1. Pull the mint address from `details.mint` and look it up on Solscan or
   Solana Explorer. Verified projects have a checkmark.
2. If the mint has no metadata, no holder count above a few hundred, and
   the supply is round (e.g. exactly 1B), assume spam and ignore the
   transfer in any aggregations you build.
3. If the mint is one your project actually owns and the alert is wrong:
   add it to the verified-mint allow list rather than lowering the
   detector threshold.

**`mev-like` anomaly fires**

A sandwich pattern was detected: a different program ran between two
operations on the same token within a tight window. Steps:

1. Open the CPI Tree and look for two of your swaps separated by a third
   program call. Note the program address of the middle call.
2. Cross-check the address on a MEV explorer (jito-mev or similar). If it
   is a known searcher, you were sandwiched.
3. Mitigations: route through a private mempool (Jito bundles), or set a
   tighter slippage so the sandwich becomes uneconomical.

**`nondeterministic` anomaly fires**

The same signature was retried and reached different final states.
Steps:

1. This usually means an account read mid-transaction returned different
   values across attempts. Look for accounts with high write contention
   (oracles, shared vaults).
2. Reduce contention by reading state at a fixed slot, or by serialising
   access through a queue program.

### Indirect signals you can use today

Even without the `Anomalies` section, the existing CLI output gives you
some of the same evidence:

- `accountDiffs` with unexpected token movements may indicate spam
  transfers; check the mint manually.
- `DEEP_CPI` plus an unfamiliar middle program is a candidate for
  investigation as MEV-like.
- Repeated failures on the same signature with different errors point at
  nondeterministic behaviour.

## 6. Batch portfolio analysis workflow

A dedicated `batch` command lands with task 4.3.1. Until then, the
following shell loop covers the same goal: run the analyser across many
signatures and roll the results up.

### Today: shell loop with `jq`

Given a file `signatures.txt` with one signature per line:

```bash
mkdir -p out
while read -r sig; do
  opendev tx "$sig" --network mainnet --json > "out/${sig}.json"
done < signatures.txt

# Aggregate: total CU, average fee, top bottlenecks
jq -s '{
  totalCU: ([.[].computeUnits.consumed] | add),
  avgFeeSol: ([.[].cost.feeSol] | add / length),
  bottlenecks: ([.[].insights[] | select(.type == "CU_BOTTLENECK") | .programId] | group_by(.) | map({prog: .[0], count: length}) | sort_by(-.count))
}' out/*.json
```

### Suggested portfolio questions

The aggregation above answers questions like:

- **Where am I spending most CU across these N transactions?** Sum
  `computeUnits.consumed` and group by `cpiTree.root[0].programId`.
- **Which framework dominates my activity?** Group `frameworkComparison`
  outputs by detected framework. Useful when deciding whether a port is
  worth it across the whole portfolio, not just one tx.
- **Which programs trigger the most insights?** Count insight types
  weighted by severity.

### Practical tips

- Start with 10 to 20 signatures, not 200. Public RPCs rate-limit at 10
  req/sec; even with our retry layer a 200-tx batch will hit walls.
- Cache hits help dramatically here. Run the loop once normally so the
  IDL cache is warm, then re-runs are ~40% faster.
- If you need machine-readable output for a dashboard or BI tool, the
  per-tx JSON files are stable. Concatenate the relevant fields with `jq`
  rather than re-parsing the raw RPC response.

When task 4.3.1 ships, the `batch` command will replace this loop with a
single invocation that aggregates results in one pass and emits a summary
report. The shell version above will keep working but the dedicated
command is faster and more accurate (no per-call shell overhead).
