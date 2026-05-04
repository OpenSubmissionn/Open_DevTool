# AI Prompt Knowledge Base — Sources

The prompt sent to the LLM (in `services/src/mcp/anthropic.ts:buildPrompt`)
embeds a curated knowledge base of Solana CU-optimization techniques. This
file lists the upstream sources used to build that knowledge base so anyone
can verify, extend, or correct the numbers and patterns we cite.

When you change the prompt, update this document with the source backing
the new claim. Numbers without a source are unsafe to ship.

## Anchor framework

| Claim in prompt | Source |
|---|---|
| PDA bump caching saves ~1,500 CU per access | Anchor Book — *PDA accounts*, https://www.anchor-lang.com/docs/pdas |
| `has_one` / `constraint` cheaper than manual checks | Anchor Book — *Account constraints*, https://www.anchor-lang.com/docs/account-constraints |
| `LazyAccount` saves ~5,000 CU on large accounts | Anchor 0.30 release notes, https://github.com/coral-xyz/anchor/releases/tag/v0.30.0 |
| `init_if_needed` enables reinit attacks | Sealevel attacks reference — *Reinitialization*, https://github.com/coral-xyz/sealevel-attacks |
| `.reload()?` required after CPI mutation | Anchor Book — *CPI*, https://www.anchor-lang.com/docs/cross-program-invocations |
| `msg!()` costs 150–500 CU | Solana Program Logging benchmarks, https://solana.com/docs/programs/debugging |

## Compute Budget

| Claim in prompt | Source |
|---|---|
| Default 200k CU / ix, 1.4M CU / tx | Solana docs — *Transaction fees and compute budget*, https://solana.com/docs/core/fees |
| Simulated CU + 10–20% buffer | Helius — *How to optimize compute usage on Solana*, https://www.helius.dev/blog/solana-compute-units |
| `getRecentPrioritizationFees` for percentile pricing | Solana RPC API, https://solana.com/docs/rpc/http/getrecentprioritizationfees |

## SPL Token / Token-2022

| Claim in prompt | Source |
|---|---|
| transfer ~3,500 CU; transferChecked ~4,500 CU | Mollusk benchmarks of SPL Token v4.0 |
| ATA creation ~25,000 CU | Empirical via Mollusk + reproducible in `services/src/data/framework-benchmarks.json` |
| Token-2022 transfer hooks add 5–20k CU | Solana docs — *Transfer hook extension*, https://solana.com/developers/guides/token-extensions/transfer-hook |

## CPI patterns

| Claim in prompt | Source |
|---|---|
| ~1,000 CU framing per CPI | Anchor Book — *CPI overhead* + Solana runtime source, https://github.com/anza-xyz/agave |
| Batching reduces overhead | General principle — measurable in repo's `bench:latency` |
| Validate target program ID before invoke | Solana security best practices, https://github.com/solana-developers/program-examples |

## DEX-specific

| Claim in prompt | Source |
|---|---|
| Jupiter v6: prefer `exactIn`, cap `maxAccounts` | Jupiter docs — *Swap API*, https://station.jup.ag/docs/apis/swap-api |
| Whirlpool: tick crossings ~5,000 CU each | Orca docs — *Whirlpool architecture*, https://orca-so.github.io/whirlpools/ |
| Raydium AMM v4: pre-validate pool state | Raydium SDK examples, https://github.com/raydium-io/raydium-sdk |

## Reliability

| Claim in prompt | Source |
|---|---|
| Always simulate before send | Helius — *How to land transactions*, https://www.helius.dev/blog/how-to-land-transactions-on-solana |
| Don't retry terminal errors | Solana RPC error catalog, https://docs.solana.com/developing/clients/jsonrpc-api |
| Durable nonces bypass blockhash expiry | Solana docs — *Durable transaction nonces*, https://solana.com/developers/courses/offline-transactions/durable-nonces |

## Native Rust / Pinocchio

| Claim in prompt | Source |
|---|---|
| Pinocchio ~80–95% CU reduction vs Anchor | Pinocchio README + benchmarks, https://github.com/anza-xyz/pinocchio |
| `create_program_address` ~50 CU vs `find_program_address` ~1.5–10k | Solana program tests, https://github.com/anza-xyz/agave/tree/master/program-runtime |

## Maintenance

When upgrading the prompt:

1. Add the new claim to `services/src/mcp/anthropic.ts:buildPrompt`.
2. Add a row to the appropriate section above with a primary source URL.
3. If the claim depends on benchmark numbers, prefer:
   - Mollusk runs from this repo (`bench:latency`)
   - Solana Foundation docs
   - Helius / Triton / official protocol docs
4. Avoid Twitter/Discord-only sources — they rot.
5. When a number is contested, pick the lower bound and cite both refs.
