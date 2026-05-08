# Metrics Dashboard

## Performance Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| **Latency (simple tx)** | < 2s | Single-instruction SOL transfer |
| **Latency (complex tx)** | < 5s | 8+ instructions, deep CPI tree |
| **Cache hit reduction** | 40%+ | IDL cache implemented; reduces RPC calls for known programs |
| **Memory usage (analysis)** | < 50MB | Per-transaction analysis footprint |

---

## Test Coverage

| Module | Target | Notes |
|--------|--------|-------|
| **services/src/analysis/** | ≥ 85% | New anomalyDetector + existing modules |
| **services/src/solana/** | ≥ 80% | RPC client, IDL cache, connection utilities |
| **services/src/mcp/** | ≥ 75% | MCP insight provider (degrades gracefully) |
| **cli/src/commands/** | ≥ 80% | tx, config, and export command implementations |

---

## Anomaly Detection

| Metric | Target |
|--------|--------|
| **Recall** | ≥ 75% |
| **Precision** | ≥ 80% |
| **Spam detection accuracy** | ≥ 95% |
| **MEV-like detection recall** | ≥ 60% |

---

## Program Coverage

| Program | Status |
|---------|--------|
| **Jupiter** | ✅ Decoder exists; tested in batch3 |
| **Orca** | ✅ Decoder exists; tested in batch3 |
| **Raydium** | ✅ Decoder exists; tested in batch3 |
| **Marinade** | ⏳ Planned Week 3 |
| **Magic Eden** | ⏳ Planned Week 3 |
| **Phantom** | ⏳ Planned Week 3 |
| **Mango Markets** | ⏳ Planned Week 4 |

---

## Learnings

### What Was Hard

- **MEV detection heuristics** — Distinguishing sandwich attacks from legitimate complex swaps required careful threshold tuning. Initial version flagged too many legitimate transactions; added "swap" keyword requirement to reduce false positives.
- **RPC timeout handling** — Transactions with null or missing compute units required defensive coding throughout the pipeline. Made mergeAnalysis async to allow graceful degradation.

### What Was Easy

- **Spam detection** — Unknown tokens with > 1M volume is a strong heuristic. Achieved 95%+ accuracy with no false positives in test suite.
- **Integration with existing pipeline** — detectAnomalies accepts the same transfer list as cost analysis, making integration seamless.

### One Surprise

- **Nondeterministic failure rarity** — Expected more failed transactions in test data, but most failures were pre-execution (err set, cu=0). Only 4/45 scenarios met the nondeterministic criteria, suggesting this is a rare but important edge case.

---

## Comparison with Week 2 Targets

| Feature | Week 2 | Week 3 | Notes |
|---------|--------|--------|-------|
| **MCP client** | ✅ | ✅ | Stable; used by insight engine |
| **Cost analyzer** | ✅ | ✅ | Stable; used by all pipelines |
| **Anomaly detector** | ❌ | ✅ | **NEW**: 3 detection rules + 45 test scenarios |
| **Framework comparator** | ✅ | ✅ | Stable; extended with anomaly context |
| **CPI tree builder** | ✅ | ✅ | Stable; used by MEV detection heuristic |
| **Async merger** | ⏳ | ✅ | Completed; enables graceful MCP failures |

---

## Next Steps (Week 4)

1. **Expand safe mint list** — Add Marinade, Magic Eden, and Phantom tokens to spam exclusion list.
2. **Integrate with MCP** — Add anomaly detection patterns to Claude Haiku context for enhanced insights.
3. **Tune MEV detection** — Collect real sandwich attack examples to improve recall without increasing false positives.
4. **Performance benchmark** — Run full pipeline on 100-tx batch and measure memory/latency.
