# Terminal Output Snapshot Tests

Visual regression tests that lock the formatted CLI output of `renderTerminal`
(`cli/src/renderers/terminal/renderer.ts`) so unintended UI changes get caught
in code review instead of in production.

## What is covered

`terminalOutput.snap.test.ts` exercises 6 representative scenarios:

| Scenario       | Source                              | What it locks                                        |
|----------------|--------------------------------------|------------------------------------------------------|
| simple success | `mockSimpleTransfer.json`           | Basic SOL transfer, no CPI, low CU                   |
| failed         | `mockFailedTx.json`                 | Failure header, error rendering, no transfers        |
| deep-cpi       | `mockDeepCpiTx.json`                | 3-level CPI tree formatting                          |
| high-cu        | `mockHighCuTx.json`                 | Bottleneck program highlight, large CU numbers       |
| spam           | inline (large unknown SPL mint)     | `Spam? ⚠ YES` flag in transfer breakdown table       |
| mev-mix        | inline (multi-program, ~195k CU)    | Multi-instruction CPI tree, budget-risk insights     |

## Determinism

Snapshots are stable across local + CI because:

- `chalk.level = 0` and `FORCE_COLOR=0` are set in `beforeAll`, so no ANSI
  color codes leak into the captured string.
- A regex strip (`/\x1B\[[0-9;]*m/g`) removes any residual escape sequences
  emitted before chalk was muted.
- The pipeline runs offline — no MCP / no RPC — so insights are rule-only.

If you see a snapshot diff that only contains ANSI escape codes, the chalk
mute hasn't applied early enough; double-check the `beforeAll` runs before the
first `renderTerminal` call.

## Running

```bash
# from repo root
npm run test:unit                           # CI-equivalent: fails on mismatch
# or, just the snapshots
npx vitest run tests/snapshots --workspace @open/services
```

## Updating snapshots — intentional changes only

When a renderer change is **intentional** (better formatting, new column,
copy edit), regenerate snapshots and commit them along with the code change:

```bash
# update everything in the snapshot file
npx vitest run tests/snapshots -u --workspace @open/services

# update a single test interactively
npx vitest tests/snapshots --workspace @open/services
# then press `u` in the Vitest UI to accept the failing snapshot
```

After regenerating, **review the diff in
`__snapshots__/terminalOutput.snap.test.ts.snap`** before committing — the
point of these tests is that every visual change shows up in code review.

## Adding a new scenario

1. Either add a `*.json` raw bundle in `services/tests/fixtures/` or build an
   inline `RawTransactionBundle` literal in the test (preferred for synthetic
   shapes like spam/MEV that don't correspond to a real on-chain tx).
2. Use the helper `runPipeline(bundle)` from `tests/fixtures/utils.ts` to get
   `{ analyzed, insights }`.
3. Wrap the render in `captureTerminalOutput(...)` and `toMatchSnapshot()`.
4. Run with `-u` once to write, then commit the new snapshot block.

## CI behavior

`.github/workflows/pr-checks.yml` runs `npm run test:unit`, which invokes
`vitest run` (not `vitest`). `vitest run` **never** rewrites snapshots — a
mismatch is a hard failure. That is what makes this a regression gate.
