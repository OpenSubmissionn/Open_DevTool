# Adding a New Protocol Decoder

This guide explains how to add a new instruction decoder for a Solana protocol to the OPEN analysis pipeline.

---

## Overview

Each protocol decoder lives in its own subfolder under `services/src/analysis/decoders/`. It consists of three files:

| File | Purpose |
|---|---|
| `idl.ts` | IDL definition, program ID constant, and discriminator exports |
| `decoder.ts` | Semantic mapping, field extraction, and public decode function |
| `index.ts` | Re-exports everything from `idl.ts` and `decoder.ts` |

The decoder is then registered in two places:
- `anchor-idl.ts` — adds the program to `DEFAULT_IDL_BY_PROGRAM` (and optionally `NON_ANCHOR_BINARY_PROGRAMS`)
- `decoders/index.ts` — re-exports the new folder
- `program-registry.json` — adds the program metadata entry

---

## Step-by-step

### 1. Create the folder and IDL

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

### 2. Fill in `idl.ts`

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
- If the program uses a non-standard binary layout (not pure Anchor on-chain), add it to `NON_ANCHOR_BINARY_PROGRAMS` in `anchor-idl.ts` (see §Non-Anchor programs)

### 3. Fill in `decoder.ts`

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

### 4. Create `index.ts`

```typescript
// services/src/analysis/decoders/<protocol>/index.ts
export * from './idl';
export * from './decoder';
```

### 5. Register in `anchor-idl.ts`

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

### 6. Re-export from `decoders/index.ts`

```typescript
// services/src/analysis/decoders/index.ts
export * from './anchor-idl';
export * from './spl-token';
export * from './system-program';
export * from './marinade';
export * from './magic-eden';
export * from './<protocol>';   // ← add here
```

### 7. Add to `program-registry.json`

```json
{
  "name": "My Protocol",
  "programId": "<your-program-id>",
  "idl": "services/src/analysis/decoders/<protocol>/idl.ts",
  "framework": "Anchor"
}
```

---

## Non-Anchor programs

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

---

## Writing tests

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
- [ ] Decodes each instruction type correctly
- [ ] Returns `null` for wrong `programId`
- [ ] Returns `null` for empty or malformed data
- [ ] Returns unknown fallback for unrecognized discriminator
- [ ] Fixture hex vectors round-trip correctly
- [ ] `resolvedAccounts` populated when account list matches IDL

Run tests:
```bash
cd services && npx vitest run tests/analysis/anchor-idl.<protocol>.test.ts
```

---

## Scaffolding

```bash
# Generate boilerplate for a new decoder
bash scripts/generate-decoder.sh <protocol-name> <program-id>

# Example
bash scripts/generate-decoder.sh tensor TNSRxcUxoT9xBG3de7A4QJ1Zd9xiNnsFr3CpysHpbzt
```

The script creates the folder and three template files with all placeholders pre-filled.

---

## Validation checklist before PR

Run the decoder validation script to confirm everything is in order:

```bash
cd services && npm run validate:decoders
```

This checks:
- [ ] IDL `address` matches exported `PROGRAM_ID`
- [ ] All discriminators are unique and correctly computed
- [ ] Decoder function returns `null` for wrong program ID
- [ ] Decoder function returns `null` for empty data
- [ ] All exported types extend `DecodedAnchorInstruction`
- [ ] Test file exists at `tests/analysis/anchor-idl.<protocol>.test.ts`
- [ ] Coverage ≥ 80% on the new decoder

---

## Quick-reference: existing decoders

| Protocol | Program ID prefix | Confidence | Notes |
|---|---|---|---|
| Orca Whirlpool | `whirL` | high | Pure Anchor |
| Jupiter v6 | `JUP6L` | high | Pure Anchor |
| Raydium AMM | `675kP` | low | Non-Anchor binary |
| Marinade Finance | `MarBm` | high | Pure Anchor |
| Magic Eden | `MEisE` | low | Non-Anchor binary |
