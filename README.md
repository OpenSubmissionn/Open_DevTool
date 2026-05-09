<div align="center">

# opendev

**Visual transaction profiler and debugger for Solana.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)
[![CI](https://github.com/OpenSubmissionn/Open_DevTool/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/OpenSubmissionn/Open_DevTool/actions)

Turn any Solana transaction signature into a fully decoded execution profile —
compute units, CPI call tree, account state diffs, and AI-generated optimization
suggestions on top of deterministic rule-based insights.

</div>

---

## Quick install (recommended)

One-liner that detects your OS, ensures Node.js 20+ is installed, and installs `opendev` globally:

```sh
curl -fsSL https://raw.githubusercontent.com/OpenSubmissionn/Open_DevTool/main/install.sh | sh
```

Verify:

```sh
opendev --version
```

> **Windows users:** the curl installer requires WSL, Git Bash, or PowerShell with curl. Most Solana devs already have one of these. If you don't, follow the [Windows manual install](#windows-powershell) below.

---

## Manual install

### Requirements

- **Node.js 20+** (20 LTS recommended; some deps require Node 20+)
- **git**
- A terminal

> **Why not `npm install -g github:...` directly?** opendev is a monorepo with
> npm workspaces (cli, services, scripts). npm refuses to install workspace
> roots globally. The steps below clone + build + install only the `cli/`
> package globally — same flow the curl one-liner runs internally.

### Linux (Ubuntu / Debian / Fedora / Arch)

```bash
# 1. Install Node 20 via nvm if you don't have it
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20

# 2. Clone, build, install
git clone https://github.com/OpenSubmissionn/Open_DevTool.git
cd Open_DevTool
npm install
npm run build --workspace cli
cd cli && npm install -g . --ignore-scripts

# 3. Verify
opendev --help
```

### macOS

```bash
# 1. Install Node 20 via Homebrew if you don't have it
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 2. Clone, build, install (same as Linux)
git clone https://github.com/OpenSubmissionn/Open_DevTool.git
cd Open_DevTool
npm install
npm run build --workspace cli
cd cli && npm install -g . --ignore-scripts

# 3. Verify
opendev --help
```

### Windows (PowerShell)

```powershell
# 1. Install Node 20 via winget if you don't have it
winget install OpenJS.NodeJS.LTS
# Restart PowerShell so PATH picks up node

# 2. Clone, build, install
git clone https://github.com/OpenSubmissionn/Open_DevTool.git
cd Open_DevTool
npm install
npm run build --workspace cli
cd cli
npm install -g . --ignore-scripts

# 3. Verify
opendev --help
```

### Build from source (contributors, hot-reload)

For local development where you want code changes to reflect on every run:

```bash
git clone https://github.com/OpenSubmissionn/Open_DevTool.git
cd Open_DevTool
npm install
npm run build
npm link    # makes `opendev` point at your working tree
```

---

## Quickstart

Analyze a confirmed mainnet transaction:

```bash
opendev tx 4W8cbHAkjJC3jKdFY39JFXtTakf5JK9rz6jyGPbbpKEqhweRYzwjveZasFin46WuApDeLoQRHieG3t5b3T7VXMRR --network mainnet
```

Full analysis as JSON (pipe into `jq`, save to file, etc.):
```bash
opendev tx <signature> --json
```

Save a CSV report:
```bash
opendev tx <signature> --csv --output report.csv
```

Simulate an unsigned transaction:
```bash
opendev simulate ./my-tx.b64
```

Simulate from a source file that builds the transaction (Rust or TypeScript):
```bash
opendev simulate ./build_tx.rs    # runs `cargo run --release` in the nearest Cargo.toml
opendev simulate ./build_tx.ts    # runs `npx -y tsx build_tx.ts`
opendev simulate ./my-rust-proj   # directory with Cargo.toml
```
The runner expects the script to print the base64-serialized transaction on the **last non-empty stdout line**. See [Source-file runners](#source-file-runners) below.

CSV to a specific path:
```bash
opendev batch ./signatures.json --csv --output batch-report.csv
```

List supported programs and decoder coverage:
```bash
opendev info
```

Show the resolved CLI configuration:
```bash
opendev config
```

---

## Commands

| Command | Description |
|---|---|
| `opendev tx <signature>` | Full analysis of a confirmed transaction |
| `opendev simulate <input>` | Simulate an unsigned transaction (base64 blob, file path, or `.rs`/`.ts`/`.js` source file that builds one) |
| `opendev batch <file>` | Run analysis over a list of signatures from a JSON file |
| `opendev info` | Show registered programs, decoder status, and coverage |
| `opendev config` | Show the resolved CLI configuration |

Run `opendev <command> --help` for the full flag list.

## CLI flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--json` | boolean | false | Output full analysis as JSON |
| `--csv` | boolean | false | Output a CSV row (writes to a file by default) |
| `--output <path>` | string | — | Save output to a specific file path |
| `--network <name>` | mainnet \| devnet | mainnet | Solana network to use |
| `--rpc <url>` | string | — | Custom RPC URL (overrides `--network`) |
| `--no-cache` | boolean | false | Skip the IDL cache and re-fetch from chain |
| `--verbose` | boolean | false | Enable per-stage timing and debug output |
| `--no-exec` | boolean | false | (`simulate` only) Refuse to execute source files |
| `--exec-timeout <s>` | number | 90 | (`simulate` only) Max seconds for the source-file runner |

> When `--csv` is used without `--output`, the CLI writes a file named `<signature>.csv` in the current working directory.

---

## Source-file runners

`opendev simulate` accepts more than just a base64 blob — it can execute a script that builds the transaction and pipes the output back into the same simulation pipeline as `opendev tx`.

### Accepted inputs

| Input | Detected as | Executed with |
|---|---|---|
| base64 string | `base64` | — |
| `.b64` / `.json` (with `transaction` or `tx` field) | `path` | — |
| `.ts` / `.mts` / `.cts` | `ts-source` | `npx -y tsx <file>` |
| `.js` / `.mjs` / `.cjs` | `js-source` | `node <file>` |
| `.rs` | `rust-source` | `cargo run --release` in nearest `Cargo.toml` |
| Directory with `Cargo.toml` | `rust-source` | `cargo run --release` in that directory |

> ⚠ **TypeScript top-level await caveat.** `tsx` decides between CJS and ESM output by walking up to the **nearest `package.json`**. If that file does not declare `"type": "module"`, `tsx` emits CJS — and CJS does not support top-level `await`. A script that uses `await` at the top level will fail to compile with `Top-level await is currently not supported with the "cjs" output format`.
>
> Three ways to fix it (pick one):
> 1. Rename `tx.ts` → `tx.mts` (the `.mts` extension forces ESM regardless of `package.json`).
> 2. Add `"type": "module"` to the nearest `package.json` (may break other CJS code in that project).
> 3. Wrap your code in `async function main() { … } main()` so there's no top-level `await`.
>
> If you don't use `await` at the top level, plain `.ts` works fine.

### Protocol

Your script must **print the base64-serialized transaction on stdout**. The runner picks the last non-empty stdout line that matches the base64 alphabet and is at least 100 characters long. Anything else (logs, debug output) is ignored as long as it isn't on that final line.

The signer and recent blockhash are throwaway — `simulate` runs with `sigVerify: false` and `replaceRecentBlockhash: true` by default.

### TypeScript example

This example uses top-level `await`, so it's named `.mts` to force ESM (see the caveat above). If you'd rather keep `.ts`, see the `main()`-wrapped variant below.

```ts
// build_tx.mts
import {
  Connection, Keypair, SystemProgram, TransactionMessage, VersionedTransaction,
} from '@solana/web3.js';

const connection = new Connection(process.env.RPC_URL ?? 'https://api.devnet.solana.com');
const payer = Keypair.generate();
const recipient = Keypair.generate();
const { blockhash } = await connection.getLatestBlockhash();

const msg = new TransactionMessage({
  payerKey: payer.publicKey,
  recentBlockhash: blockhash,
  instructions: [
    SystemProgram.transfer({
      fromPubkey: payer.publicKey, toPubkey: recipient.publicKey, lamports: 1_000_000,
    }),
  ],
}).compileToV0Message();

const tx = new VersionedTransaction(msg);
tx.sign([payer]);
process.stdout.write(Buffer.from(tx.serialize()).toString('base64') + '\n');
```

```bash
opendev simulate ./build_tx.mts --network devnet
```

If you need plain `.ts` (no `.mts`), wrap the body in `main()` to avoid top-level await:

```ts
// build_tx.ts — works as plain .ts in any project, CJS or ESM
import {
  Connection, Keypair, SystemProgram, TransactionMessage, VersionedTransaction,
} from '@solana/web3.js';

async function main() {
  const connection = new Connection(process.env.RPC_URL ?? 'https://api.devnet.solana.com');
  const payer = Keypair.generate();
  const recipient = Keypair.generate();
  const { blockhash } = await connection.getLatestBlockhash();

  const msg = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey, toPubkey: recipient.publicKey, lamports: 1_000_000,
      }),
    ],
  }).compileToV0Message();

  const tx = new VersionedTransaction(msg);
  tx.sign([payer]);
  process.stdout.write(Buffer.from(tx.serialize()).toString('base64') + '\n');
}
main();
```

```bash
opendev simulate ./build_tx.ts --network devnet
```

### Rust example

```toml
# Cargo.toml
[package]
name = "build-tx"
version = "0.1.0"
edition = "2021"

[dependencies]
solana-sdk = "2.0"
solana-client = "2.0"
base64 = "0.22"
bincode = "1.3"
anyhow = "1"
```

```rust
// src/main.rs
use anyhow::Result;
use base64::{engine::general_purpose::STANDARD, Engine};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    message::{v0, VersionedMessage},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
    system_instruction,
    transaction::VersionedTransaction,
};
use std::str::FromStr;

fn main() -> Result<()> {
    let rpc = std::env::var("RPC_URL").unwrap_or_else(|_| "https://api.devnet.solana.com".into());
    let client = RpcClient::new_with_commitment(rpc, CommitmentConfig::confirmed());
    let payer = Keypair::new();
    let recipient = Pubkey::from_str("9ZNTfG4NyQgxy2SWjSiQoUyBPEvXT2WaxfKHsKhXGqHV")?;
    let ix = system_instruction::transfer(&payer.pubkey(), &recipient, 1_000_000);
    let blockhash = client.get_latest_blockhash()?;
    let msg = v0::Message::try_compile(&payer.pubkey(), &[ix], &[], blockhash)?;
    let tx = VersionedTransaction::try_new(VersionedMessage::V0(msg), &[&payer])?;
    println!("{}", STANDARD.encode(bincode::serialize(&tx)?));
    Ok(())
}
```

```bash
opendev simulate ./build-tx
```

### Cross-platform `node_modules` caveat (WSL)

If your repo lives on `/mnt/c/...` and you switch between Windows and WSL, the `node_modules` installed under one OS will not work under the other — `tsx` calls `esbuild`, and `esbuild`'s native binary is OS-specific. You'll see something like `esbuild was installed for a different platform` in the runner's stderr.

Two ways to handle it:

```bash
# Quick fix: reinstall in the OS where you'll run opendev
rm -rf node_modules package-lock.json && npm install
```

Better, long-term, work in a native Linux filesystem (`~/dev/...`) when you're in WSL — also avoids the 10–50× I/O penalty of `/mnt/c/`.

### Safety

`opendev simulate` shows a yellow `EXECUTING USER CODE` banner before spawning the runner. Pass `--no-exec` if you want the command to refuse any source-file input (useful in CI). The first run of a Rust project is slow because of `cargo build` — use `--exec-timeout 300` if you hit the 90-second default.

---

## AI-powered insights (optional)

opendev ships rule-based insights out of the box. To unlock AI-generated optimization suggestions, set one of the following keys in your `.env`:

| Provider | Env var | Free tier |
|---|---|---|
| **Groq** (recommended) | `GROQ_API_KEY` | ✅ no credit card — get one at [console.groq.com/keys](https://console.groq.com/keys) |
| **Anthropic** | `ANTHROPIC_API_KEY` | ❌ $5 minimum top-up — [console.anthropic.com](https://console.anthropic.com) |

```bash
# .env
GROQ_API_KEY=gsk_...
```

Both providers use the same prompt and return the same shape — the CLI logs which one is active at the start of each run. Without a key, only rule-based insights render.

Power-user overrides:

| Env var | Effect |
|---|---|
| `MCP_ENDPOINT_URL` | POST the payload to a custom HTTP endpoint instead of an LLM |
| `MCP_DISABLED=1` | Skip AI entirely (rule-based insights only) |
| `MCP_MODEL` | Override the default model for the active provider |

---

## Configuration

Custom RPC default:
```bash
export OPEN_RPC_URL=https://your-rpc.example.com
opendev tx <SIGNATURE>
```

opendev also reads `HELIUS_API_KEY` for richer transaction parsing when available. See `.env.example` for the full list.

---

## Project structure

```
opendev/
├── cli/        # CLI entry point and terminal renderer
├── services/   # Analysis engine, RPC layer, decoders
├── scripts/    # Validation and benchmark scripts
├── docs/       # Architecture, troubleshooting, schema references
└── web/        # Web frontend (work in progress)
```

## Documentation

| File | Topic |
|---|---|
| [Architecture](docs/Architecture_OPEN.md) | System architecture |
| [Use Cases](docs/Use_Cases.md) | Real-world usage scenarios |
| [Troubleshooting](docs/Troubleshooting.md) | Common errors and fixes |
| [MCP Schema](docs/MCP_Request_Schema.md) | AI insight payload schema |
| [Decoder Extension](docs/Extensibility_Decoder.md) | How to add a new protocol decoder |
| [AI Prompt Sources](docs/AI_Prompt_Sources.md) | CU-optimization claims with citations |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Run `npm run test:all` and `npm run validate:decoders` before opening a PR.

---

## Maintainers

- [Ana Cristina Jardim](https://www.linkedin.com/in/ana-cristina-jardim/)
- [Ana Júlia Ribeiro](https://www.linkedin.com/in/ana-j%C3%BAlia-ribeiro/)
- [Emanuelly Cantarelli Dias](https://www.linkedin.com/in/emanuelly-dias-2a0480305/)
- [Mirela Schneider Bianchi](https://www.linkedin.com/in/mirela-bianchi-608601254/)
- [Nicole Zanin Silva](https://www.linkedin.com/in/nicolezanin/)

## Contributors

[![Contributors](https://contrib.rocks/image?repo=OpenSubmissionn/Open_DevTool)](https://github.com/OpenSubmissionn/Open_DevTool/graphs/contributors)

## License

[MIT](LICENSE)
