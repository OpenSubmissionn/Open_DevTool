# Anomaly Reference

## Overview

Anomalies are suspicious or unusual patterns detected in Solana transactions that may indicate:
- **Spam/scam activity** — Unverified token transfers with unusually high volumes
- **MEV/sandwich attacks** — Complex transaction sequences with nested program calls around swaps
- **Nondeterministic failures** — Transactions that fail after consuming compute units, suggesting execution order sensitivity

The anomaly detector runs as part of the Open transaction profiler and flags these patterns with severity levels and confidence scores. This enables users to quickly identify potentially problematic transactions.

---

## Anomaly Types

| Type | Severity | Confidence | Detection Criteria |
|------|----------|------------|-------------------|
| **spam** | high | 0.85 | Unverified token mint with uiAmount > 1,000,000 |
| **mev-like** | medium | 0.6 | 3+ unique programs + "swap" keyword in logs + nested invoke levels [1] and [2] |
| **nondeterministic** | medium | 0.7 | err !== null + "failed" or "Error" in logs + computeUnitsConsumed > 0 |

---

## Safe Mints (Not Flagged as Spam)

The following well-known token mints are automatically excluded from spam detection, even for large transfer amounts:

- **USDC** — `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- **USDT** — `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`
- **wSOL** — `So11111111111111111111111111111111111111112`

Any token transfer from these mints, regardless of amount, will not be classified as spam.

---

## False Positive Guidance

### Known Limitations

1. **MEV-like detection is heuristic-based** — The pattern requires 3+ programs, a swap keyword, and nested invocation levels. Legitimate complex swaps may trigger this pattern even when no sandwich attack is occurring. Always inspect the transaction logs and CPI tree manually.

2. **Nondeterministic detection requires explicit error** — The detector only fires when `err` field is explicitly set AND compute units were consumed. Transactions that fail silently without logging or use anchor-style error recovery may not be detected.

3. **Spam detection cannot distinguish utility airdrop from scam** — Any unknown token mint with > 1M volume is flagged. Legitimate airdrops or test token distributions will be flagged if the mint is not in the safe list.

### Interpreting Confidence Scores

- **≥ 0.80** — High confidence. Likely true positive; investigate further.
- **0.60–0.79** — Medium confidence. May indicate the pattern; cross-reference with on-chain data (program reputations, CPI tree shape, actual swap execution).
- **< 0.60** — Low confidence. Use as a starting point only; requires manual validation.

---

## Edge Cases

- **Zero compute units consumed** — No nondeterministic anomaly is flagged if computeUnitsConsumed is 0, even if err is set. This avoids false positives for pre-flight failures.
- **Empty log messages** — Transactions with no logs (e.g., early validation failures) will not trigger mev-like or nondeterministic detection.
- **Null blockTime** — Transactions with unknown timestamps are still analyzed normally; blockTime is not used for anomaly detection.
- **Multiple spam transfers** — Each spam-suspect transfer is flagged as a separate anomaly, allowing users to see the full list of suspicious transfers.
- **Boundary case at 1M volume** — The spam threshold is strictly `>` (greater than), so exactly 1,000,000 volume is NOT flagged as spam.
