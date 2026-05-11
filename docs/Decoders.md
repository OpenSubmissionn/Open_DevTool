# Decoders

## Introduction

The decoder system is what lets OPEN translate raw Solana instruction bytes into named, human-readable operations: `swap` instead of `0xa0f5...`, `deposit` instead of an unlabelled CPI, `transferChecked` with typed amounts and mints. Without it, every output above the RPC layer would be a wall of base58 strings.

The system has two halves, and they are tightly coupled:

- **Part A — Program registry schema.** A single JSON file (`services/src/data/program-registry.json`) lists every Solana program OPEN supports, the depth of that support, and which CU benchmarks apply. This is the data the `open info` command surfaces and the source the validator reads from.
- **Part B — Adding a new decoder.** The step-by-step workflow for adding instruction decoding for a new protocol — folder layout, IDL conventions, semantic mapping, registration points, and the validation checklist that has to pass before a PR ships.

If you're auditing what's supported, start with Part A. If you're shipping support for a new protocol, you'll touch both — Part B's last step is "add an entry to the registry described in Part A".

---

## Part A — Program registry schema

Single source of truth for which Solana programs OPEN supports, the depth of that support, and which CU benchmarks apply.

- **File:** `services/src/data/program-registry.json`
- **Validator:** `scripts/validate-program-registry.ts`
- **CLI surface:** `open info` and `open info <programId|name>`

### Schema

The registry is a JSON array. Each entry conforms to:

```ts
{
  name: string,
  programId: string,             // base58, 32-44 chars
  framework: "Anchor" | "Native" | "Pinocchio",
  idl: string | null,            // repo-relative path to IDL TS file, or null
  decoderStatus: "complete" | "partial" | "planned" | "none",
  benchmark: {
    framework: string,           // must equal entry.framework
    operations: string[]         // must exist in framework-benchmarks.json
  } | null,
  coverage: number,              // 0-100, COMPUTED — do not hand-edit
  lastUpdated: string            // ISO date "YYYY-MM-DD"
}
```

#### Field reference

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Human-readable. Used by `open info` for lookup and display. |
| `programId` | yes | On-chain program address. Must be unique across the registry. |
| `framework` | yes | Constrains valid `benchmark.framework` values. |
| `idl` | yes | Path is repo-relative (e.g. `services/src/analysis/decoders/anchor-defs/anchor-idl-jupiter.ts`). Validator confirms the file exists. `null` for programs without an IDL (Native). |
| `decoderStatus` | yes | See enum below. |
| `benchmark` | yes | `null` if no CU benchmarks apply. Otherwise links into `framework-benchmarks.json`. |
| `coverage` | yes | Set by validator with `--write`. Writing by hand will be overwritten. |
| `lastUpdated` | yes | Updated by validator when coverage changes. |

#### `decoderStatus` enum

| Value | Meaning |
|---|---|
| `complete` | All instructions of interest have decoders (rich `tx` output). |
| `partial` | Some instructions decode; others fall back to raw bytes. |
| `planned` | Decoder is on the roadmap but not implemented yet. |
| `none` | No plan to decode (transaction shows raw program ID only). |

### Coverage rule

Coverage is **computed**, not authored. The validator scores each entry on three signals:

| Signal | Criterion |
|---|---|
| IDL present | `idl` is non-null AND points to a file that exists on disk |
| Decoder ready | `decoderStatus` is `complete` or `partial` |
| Benchmarked | `benchmark` is non-null |

```
coverage = round((trueCount / 3) * 100)
```

**Native exception:** Native programs (System, SPL Token) get IDL credit if `idl: null` and `decoderStatus: "complete"`, since they're decoded directly without an IDL.

Examples:

- IDL exists, decoder complete, benchmark linked → **100%**
- IDL exists, decoder complete, no benchmark → **66%**
- No IDL (Anchor program), decoder planned, no benchmark → **0%**

### Validation

The validator enforces:

1. **Schema** — all required fields, correct types, enum values
2. **Format** — `programId` matches base58 pattern, `lastUpdated` is ISO `YYYY-MM-DD`
3. **Uniqueness** — no duplicate `programId`s
4. **Filesystem** — non-null `idl` paths must exist on disk
5. **Cross-reference** — `benchmark.framework` matches entry `framework`; every operation in `benchmark.operations` exists in `framework-benchmarks.json` for that framework
6. **Coverage drift** — computed coverage is compared against stored value; mismatches are reported

#### Usage

```bash
# Read-only check (used in CI)
cd scripts && npm run validate:registry

# Update coverage and lastUpdated for drifted entries
cd scripts && npm run validate:registry -- --write
```

Exit codes: `0` on success, `1` on any validation failure.

### CLI integration

```
open info                  # table view of all entries
open info <programId>      # detail view by program ID
open info "Marinade"       # detail view by name (substring match)
```

The CLI reads the registry at runtime — no rebuild needed after a JSON edit.

### Related files

| File | Relationship |
|---|---|
| `services/src/data/framework-benchmarks.json` | Source of truth for `benchmark.operations` |
| `services/src/analysis/decoders/anchor-defs/*.ts` | IDL files referenced by the `idl` field |
| `services/src/analysis/decoders/{spl-token,system-program}.ts` | Native decoders backing `decoderStatus: "complete"` for Native entries |
| `cli/src/commands/info.ts` | Command that surfaces the registry to users |

---

## Part B — Adding a new decoder

This section explains how to add a new instruction decoder for a Solana protocol to the OPEN analysis pipeline.

### Overview

Each protocol decoder lives in its own subfolder under `services/src/analysis/decoders/`. It consists of three files:

| File | Purpose |
|---|---|
| `idl.ts` | IDL definition, program ID constant, and discriminator exports |
| `decoder.ts` | Semantic mapping, field extraction, and public decode function |
| `index.ts` | Re-exports everything from `idl.ts` and `decoder.ts` |

The decoder is then registered in two places:

- `anchor-idl.ts` — adds the program to `DEFAULT_IDL_BY_PROGRAM` (and optionally `NON_ANCHOR_BINARY_PROGRAMS`)
- `decoders/index.ts` — re-exports the new folder
- `program-registry.json` — adds the program metadata entry (schema described in Part A)

### Step-by-step

#### 1. Create the folder and IDL

```bash
# Run the scaffolding script (see §Scaffolding below)
bash scripts/generate-decoder.sh <protocol-name> <program-id>

# Example
bash scripts/generate-decoder.sh tensor MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8
```

Or create the folder manually:

```
services/src/analysis/decoders/<protocol>/
├── idl.ts
├── decoder.ts
└── index.ts
```

#### 2. Fill in `idl.ts`

Copy `services/src/analysis/decoders/template-idl.ts` and update:

```typescript
// services/src/analysis/decoders/<protocol>/idl.ts

import { instructionDiscriminator } from '../orca/anchor-idl-orca';
import type { Idl } from '@coral-xyz/anchor';

export const MY_PROTOCOL_PROGRAM_ID = '<your-program-id>';

export const MY_PROTOCOL_IDL: Idl = {
  address: MY_PROTOCOL_PROGRAM_ID,
  metadata: { name: 'my_protocol', version: '1.0.0', spec: '0.1.0' },
  instructions: [
    {
      name: 'swap',
      discriminator: instructionDiscriminator('swap'),
      accounts: [
        { name: 'user', writable: false, signer: true },
        { name: 'pool', writable: true, signer: false },
      ],
      args: [
        { name: 'amount_in', type: 'u64' },
        { name: 'minimum_amount_out', type: 'u64' },
      ],
    },
    // add more instructions …
  ],
  accounts: [],
  errors: [],
  types: [],
  events: [],
};
```

**Key rules:**

- `address` must match `MY_PROTOCOL_PROGRAM_ID` exactly — `decodeAnchorInstruction` validates this
- `discriminator` is `sha256("global:<snake_case_name>")[0:8]` — use the imported `instructionDiscriminator` helper
- If the program uses a non-standard binary layout (not pure Anchor on-chain), add it to `NON_ANCHOR_BINARY_PROGRAMS` in `anchor-idl.ts` (see Non-Anchor programs below)

#### 3. Fill in `decoder.ts`

```typescript
// services/src/analysis/decoders/<protocol>/decoder.ts

import { decodeAnchorInstruction, type DecodedAnchorInstruction } from '../anchor-idl';
import { MY_PROTOCOL_PROGRAM_ID, MY_PROTOCOL_IDL } from './idl';
import type { ParsedInstruction } from '../../types';

export interface MyProtocolDecodedInstruction extends DecodedAnchorInstruction {
  amountIn?: bigint;
  minAmountOut?: bigint;
}

const SEMANTIC_MAP: Record<string, { type: string; action?: string }> = {
  swap: { type: 'swap', action: 'exact_in' },
  addLiquidity: { type: 'liquidity_pool', action: 'deposit' },
  removeLiquidity: { type: 'liquidity_pool', action: 'withdraw' },
};

export function decodeMyProtocolInstruction(
  ix: ParsedInstruction
): MyProtocolDecodedInstruction | null {
  if (ix.programId !== MY_PROTOCOL_PROGRAM_ID) return null;

  const base = decodeAnchorInstruction(MY_PROTOCOL_PROGRAM_ID, ix, MY_PROTOCOL_IDL);
  if (!base) return null;

  const semantic = SEMANTIC_MAP[base.instructionName] ?? { type: 'unknown' };
  const data = base.decodedData ?? {};

  const result: MyProtocolDecodedInstruction = {
    ...base,
    type: semantic.type,
    ...(semantic.action ? { action: semantic.action } : {}),
  };

  // Extract typed fields from decoded Borsh args
  if (typeof data.amount_in === 'bigint' || typeof data.amount_in === 'number') {
    result.amountIn = BigInt(data.amount_in as number);
  }
  if (typeof data.minimum_amount_out === 'bigint' || typeof data.minimum_amount_out === 'number') {
    result.minAmountOut = BigInt(data.minimum_amount_out as number);
  }

  return result;
}
```

**Field extraction conventions:**

- All numeric fields from Borsh args are exposed as `bigint` to avoid precision loss
- Optional fields use `?:` — never throw if the field is missing
- Return `null` if the program ID doesn't match or decoding fails

#### 4. Create `index.ts`

```typescript
// services/src/analysis/decoders/<protocol>/index.ts
export * from './idl';
export * from './decoder';
```

#### 5. Register in `anchor-idl.ts`

```typescript
// services/src/analysis/decoders/anchor-idl.ts

import { MY_PROTOCOL_IDL, MY_PROTOCOL_PROGRAM_ID } from './<protocol>/idl';

// Re-export
export { MY_PROTOCOL_IDL, MY_PROTOCOL_PROGRAM_ID };

// Register for default IDL lookup
const DEFAULT_IDL_BY_PROGRAM: Record<string, Idl> = {
  // ... existing entries ...
  [MY_PROTOCOL_PROGRAM_ID]: MY_PROTOCOL_IDL,
};

// If the on-chain binary layout is NOT standard Anchor, add here:
// const NON_ANCHOR_BINARY_PROGRAMS = new Set<string>([
//   RAYDIUM_AMM_PROGRAM_ID,
//   MAGIC_EDEN_PROGRAM_ID,
//   MY_PROTOCOL_PROGRAM_ID,   // ← add here
// ]);

// Add instruction classifications
const INSTRUCTION_CLASSIFICATION: Record<string, { type: string; action?: string }> = {
  // ... existing entries ...
  swap: { type: 'swap' },
  addLiquidity: { type: 'liquidity_pool', action: 'deposit' },
};
```

#### 6. Re-export from `decoders/index.ts`

```typescript
// services/src/analysis/decoders/index.ts
export * from './anchor-idl';
export * from './spl-token';
export * from './system-program';
export * from './marinade';
export * from './magic-eden';
export * from './<protocol>';   // ← add here
```

#### 7. Add to `program-registry.json`

```json
{
  "name": "My Protocol",
  "programId": "<your-program-id>",
  "idl": "services/src/analysis/decoders/<protocol>/idl.ts",
  "framework": "Anchor"
}
```

The full schema for this entry — including the computed `coverage` and `lastUpdated` fields the validator will fill in — is described in Part A.

### Non-Anchor programs

Some programs publish an Anchor IDL on-chain but execute compiled bytecode that does not follow the standard Anchor discriminator prefix. These programs must be added to `NON_ANCHOR_BINARY_PROGRAMS`:

```typescript
const NON_ANCHOR_BINARY_PROGRAMS = new Set<string>([
  RAYDIUM_AMM_PROGRAM_ID,
  MAGIC_EDEN_PROGRAM_ID,
  // new non-Anchor program here
]);
```

Effect:

- `confidence` is set to `'low'` on all decoded results
- `decoderWarning` is attached explaining the compatibility mode
- When `allowNonAnchorPrograms: false` is passed, decoding returns an `unknown` fallback

### Writing tests

Tests live in `services/tests/analysis/anchor-idl.<protocol>.test.ts`.

Use `BorshCoder.instruction.encode()` to build fixture hex vectors:

```typescript
import { BorshCoder } from '@coral-xyz/anchor';
import { MY_PROTOCOL_IDL } from '../../src/analysis/decoders/<protocol>/idl';

const coder = new BorshCoder(MY_PROTOCOL_IDL);

const FIXTURE_SWAP_HEX = coder.instruction
  .encode('swap', { amount_in: new BN(1_000_000), minimum_amount_out: new BN(990_000) })
  .toString('hex');
```

Minimum test coverage:

- Decodes each instruction type correctly
- Returns `null` for wrong `programId`
- Returns `null` for empty or malformed data
- Returns unknown fallback for unrecognized discriminator
- Fixture hex vectors round-trip correctly
- `resolvedAccounts` populated when account list matches IDL

Run tests:

```bash
cd services && npx vitest run tests/analysis/anchor-idl.<protocol>.test.ts
```

### Scaffolding

```bash
# Generate boilerplate for a new decoder
bash scripts/generate-decoder.sh <protocol-name> <program-id>

# Example
bash scripts/generate-decoder.sh tensor TNSRxcUxoT9xBG3de7A4QJ1Zd9xiNnsFr3CpysHpbzt
```

The script creates the folder and three template files with all placeholders pre-filled.

### Validation checklist before PR

Run the decoder validation script to confirm everything is in order:

```bash
cd services && npm run validate:decoders
```

This checks:

- IDL `address` matches exported `PROGRAM_ID`
- All discriminators are unique and correctly computed
- Decoder function returns `null` for wrong program ID
- Decoder function returns `null` for empty data
- All exported types extend `DecodedAnchorInstruction`
- Test file exists at `tests/analysis/anchor-idl.<protocol>.test.ts`
- Coverage ≥ 80% on the new decoder

### Quick-reference: existing decoders

| Protocol | Program ID prefix | Confidence | Notes |
|---|---|---|---|
| Orca Whirlpool | `whirL` | high | Pure Anchor |
| Jupiter v6 | `JUP6L` | high | Pure Anchor |
| Raydium AMM | `675kP` | low | Non-Anchor binary |
| Marinade Finance | `MarBm` | high | Pure Anchor |
| Magic Eden | `MEisE` | low | Non-Anchor binary |

---

## Conclusion

The decoder system splits responsibilities cleanly: the registry (Part A) is the **declarative** layer that says what's supported and at what depth, and the decoder folders (Part B) are the **operational** layer that does the actual instruction decoding. The validator stitches them together — it refuses to ship a registry entry whose IDL path doesn't exist, and the `coverage` number it computes is a function of how complete the matching decoder is.

When adding a new protocol, the rule of thumb is to do Part B first (build and test the decoder in isolation) and only then add the registry entry from Part A (which makes the new protocol visible to `open info` and to the rest of the analysis pipeline). Doing the registry entry first leaves you with a broken validator and no way to test the wiring.
