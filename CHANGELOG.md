# Changelog

All notable changes to OPEN CLI are tracked here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — Week 3

Theme: program coverage expansion, anomaly detection, performance, and BI
integration.

### Added

- **Program coverage** — decoders for Marinade Finance and Magic Eden
  (`services/src/analysis/decoders/marinade/`,
  `services/src/analysis/decoders/magic-eden/`), each with IDL, decoder
  module and fixtures.
- **Program registry** — `services/src/data/program-registry.json`
  catalogues supported programs with framework, coverage, and decoder
  status; validated by `scripts/validate-decoders.ts`.
- **Anomaly Detection Engine** (`services/src/analysis/anomalyDetector.ts`)
  with three rule families: spam (unverified high-value transfers),
  MEV-like (sandwich heuristic across 3+ programs around a swap), and
  nondeterministic failures (failed tx that still consumed CU). Wired
  into `mergeAnalysis`, surfaced in the terminal renderer (`ANOMALIES`
  section, severity-coloured) and in JSON output (`anomalies` array +
  `anomalySummary`).
- **IDL cache** (`services/src/solana/idlcache.ts`) — persistent
  filesystem cache at `~/.open-cli/cache/idls/` with 24h TTL and
  `--no-cache` override; ~40% latency reduction on warm starts.
- **`--verbose` flag** on `tx` (and globally) — per-stage timings printed
  to terminal and embedded in JSON under `_metadata.timings`.
- **`--csv` output** on `tx` and `batch` (`cli/src/renderers/csv.ts`).
  RFC 4180 quoted, columns: `txSignature, status, program, cu_consumed,
  fee_lamports, fee_sol, fee_usd, framework, insights_count,
  anomalies_count, highest_anomaly_severity, timestamp`. Designed for
  concatenation: `batch` emits a single header followed by one row per
  transaction.
- **`batch` command** (`cli/src/commands/batch.ts`) — analyses multiple
  signatures from a JSON file, aggregates patterns/costs/framework
  trends, and renders a consolidated report (terminal, JSON, CSV).
- **Latency benchmark** (`scripts/latency-benchmark.ts`) — 15-scenario
  cold/warm benchmark validating the Week 3 latency targets (simple
  &lt; 2s, complex &lt; 5s, 40%+ warm reduction).
- **Snapshot tests** for terminal output
  (`services/tests/snapshots/terminalOutput.snap.test.ts`) to catch
  visual regressions in CI.
- **Robustness batches 3 and 4** plus stress test
  (`services/tests/robustness/`) covering 45+ mainnet transactions and
  edge cases (empty accounts, deep CPI, RPC timeouts).
- **Decoder validation script** (`scripts/validate-decoders.ts`) — runs
  in CI, fails on coverage &lt; 80% or inconsistent types.
- **MCP context enrichment** — `mcpInsightProvider.summarizeCpiTree`
  bundles CPI depth/branching, bottleneck details, and account diffs
  into the prompt payload.

### Changed

- **Insight ranking** (`services/src/analysis/insightEngine.ts`)
  rewritten with a deterministic 5-signal scoring function (severity,
  actionability, source agreement, tag intent, savings magnitude). See
  `docs/Insight_Ranking_Logic.md`.
- **CPI bottleneck percentages** in insight messages now formatted to
  one decimal (`49.8%` instead of `49.82874718918687%`).
- **Terminal renderer** — boxes now use ANSI-aware padding
  (`string-width`) so vertical borders no longer drift; CPI tree shows
  resolved program names alongside truncated IDs and a CU-share
  microbar per node; `TRANSFER BREAKDOWN` and `ACCOUNT CHANGES`
  switched to title + table layout (no more nested borders).
- **SOL transfer breakdown** (`services/src/analysis/costAnalyzer.ts`)
  now pairs outflows with inflows of matching magnitude so both ends
  are visible. Unpaired deltas are labelled `(mint/rent)` /
  `(burn/rent)` instead of an ambiguous `—`.

### Fixed

- **Quality gate** — `services/src/analysis/decoders/anchor-defs/anchor-idl-marinade.ts`
  was importing `./anchor-idl-orca` (does not exist); corrected to
  `../orca/anchor-idl-orca`. `tsc --noEmit` now passes across all
  workspaces.
- **`scripts/tsconfig.json`** — removed `composite: true`, added
  explicit `rootDir: ".."` and `noEmit: true` so cross-package imports
  from `services/src/...` typecheck cleanly.
- **`scripts/latency-benchmark.ts`** imports — added `.js` extensions
  required by NodeNext module resolution.
- **CSV/JSON branches** in `tx` command no longer emit spinner output
  or stderr noise that would corrupt machine-readable streams.

### Notes

- The `Phantom` decoder originally planned for Day 13 was dropped
  because Phantom is a wallet, not an on-chain program. Replacement
  decoder for a real on-chain program (Pump.fun or Tensor) is tracked
  for Week 4.
- `services/src/data/programs.json` still contains a few stale
  placeholder program IDs; the terminal renderer ships an inline
  override map for the most common programs (Token, Token-2022, ATA,
  Compute Budget, Pump.fun, etc.) as a workaround. Tracked for cleanup.

## [0.1.0] — Week 2

Initial public surface: transaction fetcher, log parser, CU profiler,
CPI tree builder, account diff, cost analyzer, insight engine
(rule-based + MCP), terminal and JSON renderers, framework comparator,
decoders for Jupiter / Orca / Raydium / SPL Token / System Program.
