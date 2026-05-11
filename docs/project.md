# OPEN — Project Overview


## What OPEN is

OPEN is a **Solana transaction debugger and profiler**. You give it a transaction signature; it gives you back a clear, structured explanation of what that transaction did, how much it cost, why it might have failed, and what to change to make the next one cheaper or safer.

It works on two surfaces that share the same analysis engine:

- **Web** — paste a signature at https://open-frontier-azure.vercel.app and see the analysis in the browser. No install, no setup.
- **CLI** — `npm install -g github:OpenSubmissionn/Submission_Open`, then `open tx <signature>` in any terminal. Designed for scripting, batch jobs, custom RPC endpoints, and JSON / CSV pipelines.

Both surfaces produce the same outputs: CPI call tree, compute-unit profile, per-account state diffs, ranked insights, and a Solscan-style execution log.

## The problem we solve

Solana transactions are fast and cheap, but their post-mortem story is hard to read. When something goes wrong, a failed transaction, an unexpectedly expensive call, a swap that didn't land where you expected, the developer has to:

1. Pull the transaction from an RPC.
2. Walk through hundreds of log lines, often nested across multiple program invocations.
3. Reconstruct, by hand, which program consumed how much CU and which accounts changed.
4. Cross-reference Anchor IDLs, framework benchmarks, and SPL Token semantics to translate raw bytes into instruction names.
5. Try to identify whether the cost is structural (their program's design) or incidental (a CPI target, a token-program overhead).

This is hours of work for a single non-trivial transaction. It is also work that almost every Solana team does, repeatedly, because there's no standard tool for it. Solscan and the standard explorers are great for "did the transaction succeed?" but not for "where did the 1.4M CU go and what should I change?".

OPEN exists to collapse that hours-long workflow into a single command and a single, ranked recommendation list.

## Who it's for

The primary audience is the **Solana program developer**. More specifically, anyone who:

- Ships an on-chain program and cares about CU consumption (DeFi, NFT marketplaces, MEV infrastructure, payment protocols).
- Debugs failed or unexpected transactions in production.
- Wants to compare framework choices (Anchor vs Native vs Pinocchio) before committing to a redesign.
- Investigates suspicious transactions (spam transfers, sandwich attacks, nondeterministic failures).
- Runs batch analysis across a portfolio of transactions or wallets.

Secondary audiences:

- **Auditors and security researchers** — the CPI tree and account-diff outputs make it easier to spot suspicious flows.
- **dApp engineering teams** — the cost analyzer surfaces fee impact in USD, which is what product and finance teams actually want to see.
- **Educators and students** — the structured output is significantly easier to teach with than raw RPC responses.

## What OPEN does, in plain English

| Capability | What the user gets |
|---|---|
| **Transaction analysis** | A clear breakdown of every instruction, which program ran it, and how much CU it consumed. |
| **CPI tree** | A visual / structured tree of cross-program calls, indented by depth, so the user can see who called whom. |
| **CU profile** | Where the compute budget went, including the bottleneck program and per-program utilisation. |
| **Account diffs** | What changed for each account: SOL deltas, token deltas, role (signer / writable / readonly). |
| **AI-ranked insights** | A list of recommendations — bottlenecks to optimise, CU waste to trim, failures to investigate — ordered so the most actionable item is first. |
| **Anomaly detection** | Flags for spam transfers, MEV-like patterns, and nondeterministic failures, with confidence scores. |
| **Cost analysis** | Fee in SOL and USD, plus the per-transfer USD impact for token movements. |
| **Framework comparator** | Estimated CU delta if the same workload were rewritten in a different framework (Anchor, Native, Pinocchio). |
| **Batch analysis** | Same pipeline across many transactions at once, with CSV / JSON exports for spreadsheets and dashboards. |

The AI insight layer combines two sources: deterministic rule-based checks (always available) and an optional AI provider (Groq or Anthropic, with API key). When both layers agree on an issue, OPEN merges them into a single high-confidence "hybrid" insight.

## Why this is different

A few things separate OPEN from the alternatives a developer might already be using:

- **Same engine, two surfaces.** Web for quick lookups, CLI for scripts and batch jobs — both produce identical outputs. No "the website shows X but my script returns Y" surprises.
- **AI insights with sources, not vibes.** The prompt the AI sees is grounded in a curated knowledge base with primary sources for every claim (Anchor docs, Helius blogs, Mollusk benchmarks). When a number is contested, we pick the lower bound and cite both refs. See `AI_Insights.md`.
- **Ranking that respects actionability.** Diagnostic warnings ("our tool isn't sure about this number") never push past insights with concrete savings or fix steps. The user's top three results are always things they can actually do something about.
- **Open extension model.** Adding a new protocol decoder is a documented, scaffolded process and the program registry that drives the `open info` view is a single JSON file (see `Decoders.md`).
- **Free defaults.** Out of the box, OPEN ships with rule-based insights and works against public Solana RPC. Adding a Helius API key makes it faster and richer; adding a Groq key (free tier) unlocks AI suggestions. No hard paywall.

## How users typically interact

The most common workflows the CLI is designed for:

- **Audit CU spending on a single transaction** — `open tx <sig> --verbose`, read the bottleneck and savings recommendations.
- **Optimise a program** — pipe `--json` output into a script, surface the top recommendations in CI or in a dashboard.
- **Investigate a failed transaction** — feed the signature, read the `EXECUTION_FAILURE` insight at the top of the list, follow the linked program ID into the CPI tree.
- **Compare frameworks** — read the framework comparator section to see whether moving to Pinocchio or Native would actually help for this workload.
- **Anomaly investigation** — analyse a suspicious transaction, look at the spam / MEV-like / nondeterministic flags before sending the rest to a human reviewer.
- **Batch portfolio analysis** — run `open batch` against a list of signatures, export CSV, slice in a spreadsheet.

Detailed walkthroughs for each of these live in `Use_Cases.md`.

## Where OPEN sits in the Solana ecosystem

OPEN is **post-execution analysis**, not a wallet, RPC, indexer, or simulator-replacement. It depends on:

- **Solana RPC** (default mainnet-beta, configurable) for the raw transaction bundle.
- **Helius** (optional, recommended) for richer parsed transaction data, lower latency, and webhook-like patterns.
- **Anchor IDLs** for programs that publish them on-chain — fetched and cached locally.
- **An AI provider** (optional, Groq or Anthropic) for AI-generated suggestions on top of the deterministic rule layer.

It does **not** require a wallet, never asks the user to sign anything, never holds funds, and never executes transactions on chain. The CLI's only network calls are `getParsedTransaction`-shaped reads and (optionally) the AI provider's API.

## Roadmap

**Module One is just the first piece.** The hackathon MVP delivers a complete first module — visualisation — and points clearly at the two modules that come next. The product is built in three stages, each one self-contained but designed to compose with the others.

### Module One — Visualize · *Now*

The piece you're looking at today. Turns a raw signature into a structured, readable view.

- **Flame Graph** — visual breakdown of where the compute budget went.
- **CPI tree** — cross-program calls, indented by depth, so the user sees who called whom.
- **Account diffs** — per-account state changes: SOL deltas, token deltas, role.
- **Insight layer** — ranked recommendations that combine deterministic rules with grounded AI suggestions.

### Module Two — Integrate · *Soon*

Make the analysis engine reachable from places other than a single browser tab or terminal.

- **CLI** — already shipping; expands into batch jobs, custom RPCs, and CI-friendly JSON / CSV pipelines.
- **REST API** — programmatic access to the same engine that powers the web and CLI surfaces.
- **Audit-ready exports** — structured outputs sized for security firms, protocol teams, and post-mortem reports.

### Module Three — Optimize · *Ahead*

The deepest layer — turning the analysis into concrete, defensible recommendations rather than guesses.

- **Compute-unit cost math** — exact CU accounting per instruction, per CPI hop, per account access.
- **Account access patterns** — surface read/write hotspots and contention risks across a program.
- **CPI-depth analysis** — quantitative cost of nesting, with per-program framing overhead.
- **Source-backed, not AI-guessed** — every claim grounded in primary references (Anchor docs, Mollusk benchmarks, Solana runtime source). The AI layer ranks and explains; it does not invent the numbers.





