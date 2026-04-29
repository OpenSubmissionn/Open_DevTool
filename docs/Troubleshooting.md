# OPEN: Troubleshooting & FAQ

This guide covers the 10 most common failures hit during Weeks 1 to 3 of OPEN
development, plus the debug commands you can use to diagnose new issues.

For each entry: **Symptom** (what you see), **Cause** (why it happens), and
**Fix** (step-by-step). All shell snippets assume you are at the repo root.

## Table of Contents

1. [`Error: Invalid transaction signature.`](#1-error-invalid-transaction-signature)
2. [`failed to get transaction: <sig>`](#2-failed-to-get-transaction-sig)
3. [`Error: Invalid network.`](#3-error-invalid-network)
4. [`[MCP] Degraded: MCP_ENDPOINT_URL not set`](#4-mcp-degraded-mcp_endpoint_url-not-set)
5. [`Helius API Error: ...` / 401 / 429](#5-helius-api-error---401--429)
6. [`npm install` fails or lockfile drift](#6-npm-install-fails-or-lockfile-drift)
7. [Double output / broken colors on Windows](#7-double-output--broken-colors-on-windows)
8. [Snapshot tests fail with locale-dependent numbers](#8-snapshot-tests-fail-with-locale-dependent-numbers)
9. [Stale or corrupt IDL cache](#9-stale-or-corrupt-idl-cache)
10. [`open` command not found after build](#10-open-command-not-found-after-build)
11. [Debug Commands](#debug-commands)
12. [Expected vs Broken Output](#expected-vs-broken-output)
13. [Coverage Map](#coverage-map)

## 1. `Error: Invalid transaction signature.`

**Symptom**

```
Error: Invalid transaction signature.
```
Process exits with code 1 before any RPC call.

**Cause**

The CLI rejects signatures whose length is not 87 or 88 chars
(`cli/src/commands/tx.ts:89`). Most often a copy/paste mistake: trailing
space, truncated string, or a block hash pasted instead of a tx signature.

**Fix**

1. Confirm the string is a base58 signature (length 87 to 88), not a block
   hash or account pubkey.
2. Re-copy from Solscan or Solana Explorer, never the URL fragment.
3. Quote the argument so the shell does not eat characters:

   ```bash
   npm run cli -- tx "5Nd...full-signature-here..." --network mainnet
   ```

## 2. `failed to get transaction: <sig>`

**Symptom**

```
Pipeline Crash
Detail: failed to get transaction: 5Nd...
```
Thrown by `services/src/solana/rpc.ts:23`.

**Cause**

Three possibilities, in order of likelihood:

- The signature exists on a different network (you queried devnet but the tx
  is on mainnet, or vice-versa).
- The RPC endpoint pruned the transaction (public RPCs only retain a few
  weeks of history).
- Transient RPC failure. `withRetry` already retried 3x with exponential
  backoff, so this means all 3 attempts failed.

**Fix**

1. Try the other network:

   ```bash
   npm run cli -- tx <sig> --network mainnet
   npm run cli -- tx <sig> --network devnet
   ```
2. If still failing on mainnet for an old tx, point at an archive RPC
   (Helius, QuickNode):

   ```bash
   echo 'HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...' >> .env
   ```
3. Re-run with `--verbose` to see retry warnings (`Attempt N failed.
   Retrying in Nms...`). If you see all 3 retries time out, the RPC is the
   problem, not your input.

## 3. `Error: Invalid network.`

**Symptom**

```
Error: Invalid network.
```

**Cause**

Only `mainnet` and `devnet` are accepted (`cli/src/commands/tx.ts:103`).
Common typos: `main`, `dev`, `mainnet-beta`, `MAINNET`.

**Fix**

```bash
npm run cli -- tx <sig> --network mainnet     # ok
npm run cli -- tx <sig> --network devnet      # ok
npm run cli -- tx <sig> --network mainnet-beta  # rejected
```

The CLI lower-cases its input, so capitalization is fine, but the value
itself must be exactly `mainnet` or `devnet`.

## 4. `[MCP] Degraded: MCP_ENDPOINT_URL not set`

**Symptom**

A yellow warning is printed during analysis and the `Insights` section in
the terminal output is missing the AI-generated suggestions (rule-based
insights still render).

**Cause**

`MCP_ENDPOINT_URL` is not exported in the environment
(`services/src/mcp/client.ts:76`). The pipeline degrades gracefully: the
analysis completes but no MCP suggestions are produced.

**Fix**

1. Copy the example file and fill in the endpoint:

   ```bash
   cp .env.example .env
   ```
2. Add the MCP endpoint to `.env`:

   ```
   MCP_ENDPOINT_URL=https://your-mcp-host/v1/insights
   ```
3. Restart any open shell so `dotenv` picks the new value up.

If you intentionally want to run without MCP (faster for snapshot tests,
local CI), the warning is harmless. Leave the variable unset.

## 5. `Helius API Error: ...` / 401 / 429

**Symptom**

```
Helius API Error: Unauthorized
```
or
```
Helius API Error: 429 Too Many Requests
```
Logged from `services/src/solana/programs.ts:44`.

**Cause**

- **401**: `HELIUS_API_KEY` missing or invalid in `.env`.
- **429**: free-plan rate limit hit (10 req/sec on the public Helius tier).

**Fix**

1. Verify the key is set and not surrounded by quotes:

   ```bash
   grep HELIUS .env
   ```
   Expected: `HELIUS_API_KEY=hk_xxxxxxxxxxxxxxxxxxxx` (no quotes).
2. For 429s, throttle the call site or upgrade tier. The CLI already retries
   3x. If you keep hitting 429 the request rate is the issue, not the key.
3. If you do not have a Helius key yet, the public RPC fallback in
   `services/src/solana/connection.ts:24` handles `getTransaction` calls
   without it; only DAS and token-metadata calls require Helius.

## 6. `npm install` fails or lockfile drift

**Symptom**

```
npm error Missing: <pkg>@<version> from lock file
npm error Invalid: lock file's <pkg>@... does not satisfy ...
```
Or the build silently produces stale binaries because workspaces were not
hoisted.

**Cause**

`package-lock.json` is out of sync with the workspace `package.json` files.
This recurred several times during the project (commits `116aff9`, `9ed3436`,
`e86ce0d`), usually after merging branches that touched dependencies.

**Fix**

```bash
rm -rf node_modules
rm package-lock.json
npm install
```

Then verify:

```bash
npm run build
npm run test:all
```

Do **not** delete `package-lock.json` and commit the regenerated one in the
same change you push for review. Keep the regen in its own commit so the
diff stays readable.

## 7. Double output / broken colors on Windows

**Symptom**

Each line of CLI output appears twice, or chalk colors print as raw
ANSI escape codes (`[31m...[0m`).

**Cause**

The legacy Ink renderer (React-based terminal UI) double-renders on Windows
terminals that do not advertise true color. This was fixed in commit
`bbbdae4` by removing the Ink renderer and using direct `console.log` plus
chalk, but old branches or stale builds may still ship the Ink path.

**Fix**

1. Confirm you are on a current branch and rebuilt:

   ```bash
   git pull
   rm -rf cli/dist services/dist
   npm run build
   ```
2. Run in a terminal that supports ANSI: Windows Terminal, PowerShell 7+,
   or Git Bash. The classic `cmd.exe` will render colors as escape codes.
3. If you want plain text, pipe through a stripper:

   ```bash
   npm run cli -- tx <sig> | sed 's/\x1b\[[0-9;]*m//g'
   ```

## 8. Snapshot tests fail with locale-dependent numbers

**Symptom**

```
- Expected
+ Received

- 1,234.56
+ 1.234,56
```
Tests pass on one machine, fail on another.

**Cause**

`Intl.NumberFormat` honors the system locale. A snapshot generated on a
machine set to `en-US` will not match output generated on `pt-BR` (decimal
and thousands separators are swapped). Fixed in commit `0413191` by forcing
locale at test setup.

**Fix**

1. Run tests with the locale forced:

   ```bash
   LC_ALL=en_US.UTF-8 npm run test:all
   ```
2. On Windows PowerShell:

   ```powershell
   $env:LC_ALL = "en_US.UTF-8"; npm run test:all
   ```
3. If you intentionally changed user-facing formatting, regenerate the
   snapshots and commit them:

   ```bash
   npm run test:all -- -u
   ```

## 9. Stale or corrupt IDL cache

**Symptom**

The CLI reports a checksum mismatch in verbose mode:

```
[idl-cache] corrupt <programId> (checksum mismatch)
```
Or instructions decode with wrong names after an Anchor program upgrade.

**Cause**

The cache is stored at `~/.open-cli/cache/idls/v1/<programId>.json`
(`services/src/solana/idlcache.ts:81`). Each entry has a 24h TTL and a
SHA-256 checksum. A truncated write, manual edit, or old format version
triggers the corruption path.

**Fix**

Three options, from least to most invasive:

1. **Bypass the cache for one run** (re-fetches from network without
   touching disk):

   ```bash
   npm run cli -- tx <sig> --no-cache
   ```
2. **Drop a single program's cache entry**:

   ```bash
   rm ~/.open-cli/cache/idls/v1/<programId>.json
   ```
3. **Wipe the cache directory** (forces full re-download next run):

   ```bash
   rm -rf ~/.open-cli/cache/idls
   ```

Confirm the fix with `--verbose`. You should see `miss` then `stored`
entries instead of `corrupt`.

## 10. `open` command not found after build

**Symptom**

```
open: command not found
```
or running `npm run dev` errors with `Cannot find module '@open/services'`.

**Cause**

This is a workspaces monorepo. The `open` binary is exposed as
`npm run cli` from the root. There is no globally installed `open` unless
you `npm link` it yourself. The `@open/services` import only resolves once
all workspaces are installed and built.

**Fix**

1. Always run from the repo root:

   ```bash
   npm install        # installs all workspaces
   npm run build      # builds services + cli
   npm run cli -- tx <sig>
   ```
2. To get a global `open` binary on your PATH:

   ```bash
   cd cli && npm link
   open tx <sig>
   ```
3. If `@open/services` still cannot be resolved after a clean install, the
   workspace symlink in `node_modules/@open` is missing. Re-run
   `npm install` from the root, not from `cli/`.

## Debug Commands

| Goal | Command |
|---|---|
| Show per-stage timings, retries, IDL cache hits | `npm run cli -- tx <sig> --verbose` |
| Bypass IDL cache for this run only | `npm run cli -- tx <sig> --no-cache` |
| Force a specific RPC endpoint | `HELIUS_RPC_URL=https://... npm run cli -- tx <sig>` |
| Persist full JSON for diffing | `npm run cli -- tx <sig> --json > out.json` |
| Verify env wiring | `node -e "require('dotenv').config(); console.log(Object.keys(process.env).filter(k=>k.includes('HELIUS')||k.includes('MCP')))"` |
| Re-download every IDL | `rm -rf ~/.open-cli/cache/idls && npm run cli -- tx <sig> --verbose` |
| Confirm test suite isolation | `LC_ALL=en_US.UTF-8 npm run test:all` |
| Lint + typecheck only | `npm run lint && npx tsc --noEmit` |

## Expected vs Broken Output

### Healthy run

```
✔ Analysis Complete!

Transaction Summary
  Signature: 5Nd...
  Status:    SUCCESS
  CU used:   142,308

CPI Tree
  └─ JUP4Fb2c...  138,201 CU
     └─ whirLb...   42,910 CU

Insights
  1. Bottleneck in Jupiter aggregator (97% of CU). Consider routing.
  2. ...
```

### Degraded but non-fatal: MCP off

```
[MCP] Degraded: MCP_ENDPOINT_URL not set
✔ Analysis Complete!

Transaction Summary
  ...

Insights
  1. (rule-based) Bottleneck in Jupiter aggregator (97% of CU).
  # No AI-generated suggestions because MCP is unavailable.
```

This is **not an error**. Analysis succeeded, only the AI layer is off.

### Hard failure: bad signature

```
Error: Invalid transaction signature.
```
No spinner ever started. Exit code 1. See [#1](#1-error-invalid-transaction-signature).

### Hard failure: pipeline crash

```
✖ Pipeline Crash
Detail: failed to get transaction: 5Nd...
```
The spinner started, then `fetchTransaction` exhausted retries. See
[#2](#2-failed-to-get-transaction-sig).

## Coverage Map

Each entry below points to the historical commit or source line that
motivated the FAQ item. Eight of the ten map directly to a fix that
landed in the repo, so this guide covers >=80% of past failure modes.

| # | FAQ entry | Evidence |
|---|---|---|
| 1 | Invalid signature | `cli/src/commands/tx.ts:89` |
| 2 | failed to get transaction | `services/src/solana/rpc.ts:23` |
| 3 | Invalid network | `cli/src/commands/tx.ts:103`, fix `223658e` |
| 4 | MCP degraded | `services/src/mcp/client.ts:76-79` |
| 5 | Helius API errors | `services/src/solana/programs.ts:44` |
| 6 | Lockfile drift | commits `116aff9`, `9ed3436`, `e86ce0d`, `7e8e570` |
| 7 | Double output on Windows | commit `bbbdae4` |
| 8 | Locale-dependent snapshots | commit `0413191` |
| 9 | Stale / corrupt IDL cache | `services/src/solana/idlcache.ts:204-211` |
| 10 | `open` command not found | `package.json` workspaces config |

If you hit a failure not listed here, capture `--verbose` output and open
an issue. Entries land here once a fix or workaround is confirmed.
