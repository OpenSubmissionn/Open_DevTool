# Changelog

All notable changes to OPEN CLI are tracked here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] — Week 4

Theme: AI provider switching, decoder coverage expansion, and bug fixes
from cross-platform integration testing.

### Added

- **Multi-provider AI insights** (`services/src/mcp/`) — the CLI now
  calls Groq (free tier, Llama 3.3 70B) or Anthropic (Claude Sonnet 4.5)
  directly using the user's own API key. Resolution order: `MCP_DISABLED`
  → `MCP_ENDPOINT_URL` → `GROQ_API_KEY` → `ANTHROPIC_API_KEY` → rule-based
  fallback. Each provider returns the same `{ suggestions: string[] }`
  shape so the renderer is provider-agnostic.
- **Provider banner** — at the start of each run, the CLI logs the active
  AI provider and model (e.g. `[MCP] AI provider: Groq · llama-3.3-70b-versatile`)
  so users know whose credits are being spent.
- **Friendly degradation messages** — instead of generic
  `[MCP] Degraded: HTTP 4xx`, the CLI now emits specific guidance for the
  three common failure modes: missing key (with signup link), exhausted
  credits, and provider rate limit. The pipeline continues with rule-based
  insights in every case.
- **Insight section split** — terminal renderer now groups the
  `ACTIONABLE INSIGHTS` box into a `Rule-based` subsection followed by an
  `AI-generated (<provider> · <model>)` subsection so the source of each
  suggestion is unambiguous.
- **Decoder coverage** — Magic Eden v2 (MMM), Squads Protocol V4, and
  Drift Protocol added to the program registry. Magic Eden, Squads, and
  Marinade IDLs moved into `services/src/analysis/decoders/anchor-defs/`.
- **Documentation** — `docs/AI_Prompt_Sources.md` documents every
  CU-optimization claim in the LLM prompt with its primary source URL,
  so claims in AI suggestions are auditable.
- **`LICENSE`** — MIT license file added.
- **`CONTRIBUTING.md`** — contribution workflow, project layout, and
  decoder-extension guide for new contributors.

### Changed

- **Prompt rewritten in English** with a structured knowledge base
  organized by category (Anchor framework, compute budget, SPL Token,
  CPI patterns, DEX-specific, reliability, Pinocchio). Each technique
  cites concrete CU savings figures sourced from the Anchor Book,
  Solana docs, Helius blog, and reproducible Mollusk benchmarks.
- **README.md** — rewritten to document all five CLI commands
  (`tx`, `simulate`, `batch`, `info`, `config`), all flags including
  `--csv` and `--no-cache`, the AI provider configuration, and a clean
  install path. Also fixes a broken reference to a missing
  `CONTRIBUTING.md` (now exists).

### Fixed

- **`services/src/data/programs.json`** — corrected the Token Program,
  Token-2022, Associated Token Account, and Metaplex Token Metadata
  program IDs (the old entries had character transpositions and would
  not match real on-chain transactions). Also corrected the Orca
  Whirlpool ID and removed a fake "Phantom SOL" entry. The inline
  override map in the terminal renderer is no longer strictly necessary,
  but kept as a defense-in-depth fallback.
- **`open info` crash on Magic Eden entry** — the registry had two
  Magic Eden entries (one duplicate) both missing required fields
  (`decoderStatus`, `coverage`, `lastUpdated`, `benchmark`). The first
  entry was completed with proper marketplace operations
  (`buy`, `sell`, `list`); the duplicate was removed. `colorStatus()`
  in `cli/src/commands/info.ts` gained a `default` branch returning
  `"unknown"` to prevent future unmapped statuses from crashing the
  next `.padEnd()` call.
- **Decoder import paths after merge** — `anchor-defs/anchor-idl-{marinade,magic-eden,squads}.ts`
  were importing `./anchor-idl-orca` (which only exists at
  `../orca/anchor-idl-orca`); corrected. `anchor-idl-squads.ts` was
  using the deprecated `'publicKey'` IDL type; replaced with `'pubkey'`.
- **Program registry conflicts** — duplicate `"idl"` keys in the
  Jupiter, Orca, and Raydium entries (one pointing at the subdirectory
  decoder, one pointing at a non-existent `anchor-defs/` path) were
  resolved by keeping the subdirectory paths that actually exist.
  Marinade entry had duplicate `coverage` and `lastUpdated` fields,
  resolved.
- **CI cross-platform `npm ci`** — switched the GitHub Actions workflow
  to `npm install` because `npm ci` was failing on the Linux runner due
  to lockfile drift triggered by Windows-side optional dependencies.

### Notes

- The `services/src/data/programs.json` file still contains many
  fictional/placeholder program entries inherited from earlier
  hackathon scaffolding. Only the high-traffic entries (Token
  programs, ATA, Metaplex, Compute Budget, sysvars, and the protocols
  in the decoder registry) are guaranteed accurate. A clean rewrite
  is tracked for post-hackathon maintenance.

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
  because Phantom is a wallet, not an on-chain program. Squads V4 was
  substituted in Week 4 as the multisig replacement.
- `services/src/data/programs.json` had stale placeholder program IDs
  for the SPL Token family — fixed in 0.3.0. The terminal renderer
  retains an inline override map as a defense-in-depth fallback.

## [0.1.0] — Week 2

Initial public surface: transaction fetcher, log parser, CU profiler,
CPI tree builder, account diff, cost analyzer, insight engine
(rule-based + MCP), terminal and JSON renderers, framework comparator,
decoders for Jupiter / Orca / Raydium / SPL Token / System Program.
