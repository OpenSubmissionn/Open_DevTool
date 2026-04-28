# MCP Request Schema

Wire-format reference for the `MCPPayload` sent from the OPEN CLI to the
external MCP service. Last updated: Task 2.7.1.

## Overview

The MCP service receives a JSON document describing one analyzed transaction
and replies with a list of optimization suggestions. The payload is split into:

- **Core fields** — required, present in every request
- **Enriched context fields** — optional, populated when the engine has the data

Backwards compatibility: every enriched field is optional. Older MCP service
versions can ignore them safely.

## Top-level shape

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

## Core fields

| Field | Type | Description |
|---|---|---|
| `bottleneckProgram` | `string` | Friendly name of the program that consumed the most CU. `"Unknown"` when no bottleneck identified. |
| `instructionName` | `string` | Synthetic name for the dominant instruction, e.g. `"Jupiter V6 instruction"`. |
| `cuConsumed` | `number` | Total CU consumed by the transaction. |
| `cpiDepth` | `number` | Maximum depth of the CPI call tree. |
| `accountDiffSummary` | `string` | Compact one-line summary of SOL deltas across affected accounts. |
| `parsedErrors` | `string[]` | Error messages extracted from the transaction logs. Empty array on success. |
| `logSummary` | `string` | One-line summary, e.g. `"23 log entries, 0 errors"`. |

## Enriched context fields

### `cpiTreeStructure`

Aggregate metrics on the shape of the CPI call tree. Helps the MCP service
reason about complexity beyond raw depth.

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

### `bottleneckNode`

Detailed breakdown of the program that consumed the most CU. More structured
than the top-level `bottleneckProgram` string.

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

### `detailedAccountDiffs`

Per-account state changes with full role information and token deltas. The
core `accountDiffSummary` is human-readable; this field is machine-readable.

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

### `similarPatterns`

Reference to known optimization patterns relevant to the bottleneck program.
Populated via a name lookup; up to 3 patterns returned.

```ts
interface SimilarPattern {
  programName: string;
  pattern: string;        // short description of the typical pattern
  optimization: string;   // the recommended optimization
}
```

The current pattern set covers Jupiter V6, Jupiter Aggregator, Token Program,
Raydium AMM v4, Whirlpool, Magic Eden, and Marinade. Lookup is case-insensitive
with substring fallback (e.g. `"Jupiter"` matches both Jupiter V6 and Aggregator).

Returns `[]` when the bottleneck program is `"Unknown"` or has no known pattern.

## Example payload

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

## Versioning policy

- Adding optional fields is non-breaking.
- Renaming or removing fields is breaking — bump the schema version and
  coordinate with the MCP service.
- Field types are stable: enums (e.g. `role`) only grow, never shrink.

## Related code

| File | Role |
|---|---|
| `services/src/mcp/client.ts` | `MCPPayload` interface + HTTP client |
| `services/src/mcp/mcpInsightProvider.ts` | `buildMcpPayload()` — assembly |
| `services/tests/mcp/mcpInsightProvider.test.ts` | Wire-shape tests |
