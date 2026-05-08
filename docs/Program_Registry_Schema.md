# Program Registry — Schema

Single source of truth for which Solana programs OPEN supports, the depth of that support, and which CU benchmarks apply.

**File:** `services/src/data/program-registry.json`
**Validator:** `scripts/validate-program-registry.ts`
**CLI surface:** `opendev info` and `opendev info <programId|name>`

## Schema

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

### Field reference

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Human-readable. Used by `opendev info` for lookup and display. |
| `programId` | yes | On-chain program address. Must be unique across the registry. |
| `framework` | yes | Constrains valid `benchmark.framework` values. |
| `idl` | yes | Path is repo-relative (e.g. `services/src/analysis/decoders/anchor-defs/anchor-idl-jupiter.ts`). Validator confirms the file exists. `null` for programs without an IDL (Native). |
| `decoderStatus` | yes | See enum below. |
| `benchmark` | yes | `null` if no CU benchmarks apply. Otherwise links into `framework-benchmarks.json`. |
| `coverage` | yes | Set by validator with `--write`. Writing by hand will be overwritten. |
| `lastUpdated` | yes | Updated by validator when coverage changes. |

### `decoderStatus` enum

| Value | Meaning |
|---|---|
| `complete` | All instructions of interest have decoders (rich `tx` output). |
| `partial` | Some instructions decode; others fall back to raw bytes. |
| `planned` | Decoder is on the roadmap but not implemented yet. |
| `none` | No plan to decode (transaction shows raw program ID only). |

## Coverage rule

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

## Validation

The validator enforces:

1. **Schema** — all required fields, correct types, enum values
2. **Format** — `programId` matches base58 pattern, `lastUpdated` is ISO `YYYY-MM-DD`
3. **Uniqueness** — no duplicate `programId`s
4. **Filesystem** — non-null `idl` paths must exist on disk
5. **Cross-reference** — `benchmark.framework` matches entry `framework`; every operation in `benchmark.operations` exists in `framework-benchmarks.json` for that framework
6. **Coverage drift** — computed coverage is compared against stored value; mismatches are reported

### Usage

```bash
# Read-only check (used in CI)
cd scripts && npm run validate:registry

# Update coverage and lastUpdated for drifted entries
cd scripts && npm run validate:registry -- --write
```

Exit codes: `0` on success, `1` on any validation failure.

## Adding a new program — workflow

1. Append a new entry to `services/src/data/program-registry.json`. Set `coverage: 0` and today's date for `lastUpdated` — the validator will correct them.
2. If the program has an Anchor IDL, drop the IDL file under `services/src/analysis/decoders/anchor-defs/` and reference it in the `idl` field.
3. If you're adding a benchmark reference, ensure each operation listed exists in `framework-benchmarks.json` for the same framework. Add benchmark entries first if needed.
4. Run `npm run validate:registry -- --write` from `scripts/` to populate `coverage` and refresh `lastUpdated`.
5. Verify with `opendev info` (CLI) — the new program should appear in the table.
6. Commit both the registry change and any new IDL files together.

## CLI integration

```
opendev info                  # table view of all entries
opendev info <programId>      # detail view by program ID
opendev info "Marinade"       # detail view by name (substring match)
```

The CLI reads the registry at runtime — no rebuild needed after a JSON edit.

## Related files

| File | Relationship |
|---|---|
| `services/src/data/framework-benchmarks.json` | Source of truth for `benchmark.operations` |
| `services/src/analysis/decoders/anchor-defs/*.ts` | IDL files referenced by the `idl` field |
| `services/src/analysis/decoders/{spl-token,system-program}.ts` | Native decoders backing `decoderStatus: "complete"` for Native entries |
| `cli/src/commands/info.ts` | Command that surfaces the registry to users |
