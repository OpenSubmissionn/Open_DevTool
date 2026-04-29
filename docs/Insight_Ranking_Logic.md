# OPEN: Insight Ranking Logic

This document explains how the OPEN CLI orders the insights it produces for
each transaction. The goal of the ranking is simple: the top 3 insights a
user sees should always be the most actionable ones for their transaction.

The implementation lives in `scoreInsight()` at
`services/src/analysis/insightEngine.ts`. The function is pure and
deterministic, which keeps snapshot tests stable across machines.

## Why a ranking change was needed

Until task 2.13.1 the engine sorted by severity first and CU savings as
tiebreak. That worked while we only had three or four rules, but after the
Week 2 expansion we found two recurring problems on real fixtures:

1. **Diagnostic noise outranking actionable advice.** The
   `CU_ATTRIBUTION_LOW_CONFIDENCE` insight is `severity: warning`, but it
   reports something about our tool's confidence, not something the user
   can fix in their program. With pure severity sorting it would push a
   `CU_WASTE` `info` insight (which has a concrete savings number) below it.
2. **Hybrid insights buried behind solo rules.** When a rule and the MCP
   provider both flag the same issue we merge them into a `hybrid` insight
   (strongest signal we can produce). The old sort treated `hybrid` and
   `rule` identically.

After consolidating the insight history from 40+ transactions executed in
Days 12 to 15, both patterns repeat enough to justify rewriting the sort.

## How the score is built

`scoreInsight(insight)` returns a number; the engine sorts descending. The
score is the sum of the components below.

### 1. Severity baseline

| Severity | Points |
|---|---|
| `critical` | 100 |
| `warning` | 50 |
| `info` | 10 |

A critical insight will always outrank a warning, and a warning a non-tagged
info, before any of the other adjustments kick in.

### 2. Actionability bonuses

| Signal | Points |
|---|---|
| `codeSuggestions.length > 0` | +20 |
| `estimatedCUSavings > 0` | +15 |
| `programId` set (knows where to look) | +5 |

These are the strongest signals that the user can take an immediate action.
A code suggestion is the most concrete deliverable, so it gets the largest
bonus.

### 3. Source weight

| Source | Points |
|---|---|
| `hybrid` (rule + MCP agree) | +20 |
| `mcp` (AI-only) | +10 |
| `rule` | 0 |

`hybrid` is the strongest because two independent layers reached the same
conclusion. `mcp` alone is weighted lower because the MCP provider can
hallucinate; if the rule layer disagrees the merge falls through and we
keep both insights separately.

### 4. Tag intent adjustments

| Tag | Points |
|---|---|
| `failure` | +15 |
| `cost` or `optimization` | +10 |
| `risk` | +5 |
| `diagnostics` or `quality` | -25 |

The negative weight on diagnostics is deliberate. Insights tagged `quality`
or `diagnostics` describe the state of OPEN itself, not the user's
transaction. They still appear in the report, but never ahead of an
insight that gives the user something to act on.

### 5. Savings magnitude tiebreak

When two insights are otherwise tied, the one whose `estimatedCUSavings`
represents a larger win goes first. The bonus is `min(10, log10(savings + 1))`
so a 5x bigger saving does not dominate the ranking; it just breaks ties.

## Worked examples

### Example A: failed transaction with high CPI depth

Rules that fire: `EXECUTION_FAILURE` (critical, tag `failure`),
`BUDGET_RISK` (warning, tag `risk`), `DEEP_CPI` (info, tag `complexity`).

| Insight | Score | Breakdown |
|---|---|---|
| EXECUTION_FAILURE | 115 | 100 (critical) + 15 (failure tag) |
| BUDGET_RISK | 55 | 50 (warning) + 5 (risk tag) |
| DEEP_CPI | 10 | 10 (info) |

Final order: `EXECUTION_FAILURE`, `BUDGET_RISK`, `DEEP_CPI`. The first thing
the user sees is the failure, then the risk that the next attempt also
fails, then a structural note.

### Example B: cost insight versus diagnostic warning

Rules that fire: `CU_WASTE` (info, tags `cost` and `optimization`, savings
350,000), `CU_ATTRIBUTION_LOW_CONFIDENCE` (warning, tags `quality` and
`diagnostics`).

| Insight | Score | Breakdown |
|---|---|---|
| CU_WASTE | 40.5 | 10 (info) + 15 (savings) + 10 (cost/optimization) + 5.5 (log10 of savings) |
| CU_ATTRIBUTION_LOW_CONFIDENCE | 25 | 50 (warning) - 25 (diagnostics/quality) |

Final order: `CU_WASTE` first, even though it is `info`. The diagnostic is
still in the report so power users can inspect it, but it is no longer
hiding the actionable savings recommendation.

### Example C: hybrid bottleneck with code suggestions

Suppose the rule layer fires `CU_BOTTLENECK` (warning, programId set, tag
`performance`) and the MCP provider also returns a `CU_BOTTLENECK` insight
with two code suggestions. They merge into a single `hybrid` insight.

Score: 50 (warning) + 5 (programId) + 20 (codeSuggestions) + 20 (hybrid) = 95.

This is still below the 100 floor of any critical insight, which is the
correct behaviour: a non-critical bottleneck should never push a failure or
hard-critical issue off the top of the list.

## Reduced-confidence rules

The task also asked us to reduce confidence on rules with high false
positive rates. Two changes capture this without requiring per-rule code
edits:

- The negative weight on `diagnostics` and `quality` tags effectively
  demotes `CU_ATTRIBUTION_LOW_CONFIDENCE` whenever a more actionable
  insight exists. The rule still fires (we want the data available for
  power users), it just stops competing for the top of the list.
- `CU_WASTE` only fires when waste is greater than 50% AND the requested
  limit exceeded 200,000 CU. Below that, the optimisation is too small to
  be worth the user's attention. This threshold is unchanged from task
  2.6.1, but the new score gives `CU_WASTE` enough lift (savings + cost
  tag) to consistently appear in the top three when it does fire.

## How to validate

Two automated checks back this up:

1. `scoreInsight` is exported from `insightEngine.ts` and unit-tested
   directly in `services/tests/analysis/insightEngine.test.ts`. The tests
   cover severity ordering, source ordering, the actionable-vs-diagnostic
   case, and a top-3 mix on a realistic mock transaction.
2. The existing ordering tests (`insights[0] === 'EXECUTION_FAILURE'`,
   `insights[1] === 'BUDGET_RISK'`) still pass, which confirms backward
   compatibility for the canonical "critical first" expectation.

To re-run just the ranking suite:

```bash
npm run test -- --run services/tests/analysis/insightEngine.test.ts
```

## When to revisit

Recompute the weights if any of the following becomes true:

- A new insight type joins the engine and does not slot cleanly into one
  of the four severity / source / actionability / tag axes.
- User feedback consistently shows a specific insight type at position 1
  that is not actionable, suggesting the bonus stack is wrong.
- The MCP provider's false positive rate changes materially in either
  direction (currently we trust hybrid above mcp above rule).

The score is a single function, so future tuning should be a small,
targeted change with a test for each new boundary.
