# opendev

Visual transaction debugger and CU profiler for Solana.

`opendev` takes any Solana transaction signature (or an unsigned base64 blob) and turns it into a fully decoded execution profile — compute unit usage, CPI call trees, account state changes, transfer breakdowns, and an insight layer that flags bottlenecks automatically.

## Install

One-liner (Linux / macOS / WSL):
```bash
curl -fsSL https://raw.githubusercontent.com/OpenSubmissionn/Open_DevTool/main/install.sh | sh
```

Or, manually (the curl one-liner does this for you):
```bash
git clone https://github.com/OpenSubmissionn/Open_DevTool.git
cd Open_DevTool
npm install
npm run build --workspace cli
cd cli && npm install -g . --ignore-scripts
```

This installs the `opendev` command globally. Requires Node.js 20+.

For local development with hot-reload:
```bash
git clone https://github.com/OpenSubmissionn/Open_DevTool.git
cd Open_DevTool
npm install
npm run build
npm link
```

That makes `opendev` point at your working tree.

## Quickstart

Analyze a confirmed transaction on mainnet:

```bash
opendev tx <SIGNATURE>
```

Analyze on devnet:

```bash
opendev tx <SIGNATURE> --network devnet
```

Output as JSON:

```bash
opendev tx <SIGNATURE> --json
```

Save a CSV report:

```bash
opendev tx <SIGNATURE> --csv --output ./report.csv
```

Simulate a transaction that has not been broadcast yet (base64 blob or path to a file containing one):

```bash
opendev simulate <BASE64_TX>
opendev simulate ./my-tx.b64
```

## Commands

| Command | Description |
|---|---|
| `opendev tx <signature>` | Full analysis of a confirmed transaction |
| `opendev simulate <input>` | Simulate an unsigned transaction (base64 blob or file path) |
| `opendev batch <file>` | Run analysis over a list of signatures |
| `opendev info` | Show registered programs and decoder coverage |
| `opendev login [provider]` | Browser-assisted setup for AI insights (default: groq) |
| `opendev config set-key <provider> <key>` | Save an AI provider key from a script |
| `opendev config get-key [provider]` | List configured keys (masked) and their source |
| `opendev config remove-key <provider>` | Delete a key from the credential store |
| `opendev config set-rpc <url>` | Set the default Solana RPC URL |

Run `opendev <command> --help` for the full flag list.

## Common flags

| Flag | Default | Description |
|---|---|---|
| `--network <name>` | `mainnet` | `mainnet` or `devnet` |
| `--rpc <url>` | — | Custom RPC URL (overrides `--network`) |
| `--json` | `false` | Output as machine-readable JSON |
| `--csv` | `false` | Save a CSV report |
| `--output <path>` | — | Output file path |
| `--verbose` | `false` | Enable debug logging |

## AI insights (optional)

opendev ships rule-based insights by default. To add AI-generated optimization suggestions, get a free key from [console.groq.com/keys](https://console.groq.com/keys) (no credit card) or a paid one from [console.anthropic.com](https://console.anthropic.com), then:

```bash
opendev login              # browser opens, paste key, gets validated, saved
```

Keys live in `~/.opendev/credentials.json` (chmod 600). For scripted setup:

```bash
opendev config set-key groq gsk_xxxxxxxxxxxxxxxx
opendev config get-key                       # confirm
```

Shell `GROQ_API_KEY` / `ANTHROPIC_API_KEY` exports still work and take precedence.

## Configuration

To use a custom RPC by default, set `OPEN_RPC_URL` in your environment:

```bash
export OPEN_RPC_URL=https://your-rpc.example.com
opendev tx <SIGNATURE>
```

## Links

- [Source code](https://github.com/OpenSubmissionn/Open_DevTool)
- [Issues](https://github.com/OpenSubmissionn/Open_DevTool/issues)

## License

MIT
