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
| `opendev info` | Show CLI environment info |
| `opendev config` | Show resolved configuration |

Run `open <command> --help` for the full flag list.

## Common flags

| Flag | Default | Description |
|---|---|---|
| `--network <name>` | `mainnet` | `mainnet` or `devnet` |
| `--rpc <url>` | — | Custom RPC URL (overrides `--network`) |
| `--json` | `false` | Output as machine-readable JSON |
| `--csv` | `false` | Save a CSV report |
| `--output <path>` | — | Output file path |
| `--verbose` | `false` | Enable debug logging |

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
