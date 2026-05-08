# solana-open

Visual transaction debugger and CU profiler for Solana.

`solana-open` takes any Solana transaction signature (or an unsigned base64 blob) and turns it into a fully decoded execution profile — compute unit usage, CPI call trees, account state changes, transfer breakdowns, and an insight layer that flags bottlenecks automatically.

## Install

```bash
npm install -g solana-open
```

This installs the `open` command globally. Requires Node.js 18+.

If installing from the repository source instead of npm registry, run:

```bash
npm install
npm run build
npm link
```

That ensures `cli/dist/open.js` is generated before the CLI is used.

> **macOS users:** macOS ships its own `open` command (it opens files/URLs). After installing this package, the npm-installed `open` may shadow the system one depending on your `PATH` order. If that bothers you, you can invoke it explicitly via `npx solana-open` instead.

## Quickstart

Analyze a confirmed transaction on mainnet:

```bash
open tx <SIGNATURE>
```

Analyze on devnet:

```bash
open tx <SIGNATURE> --network devnet
```

Output as JSON:

```bash
open tx <SIGNATURE> --json
```

Save a CSV report:

```bash
open tx <SIGNATURE> --csv --output ./report.csv
```

Simulate a transaction that has not been broadcast yet (base64 blob or path to a file containing one):

```bash
open simulate <BASE64_TX>
open simulate ./my-tx.b64
```

## Commands

| Command | Description |
|---|---|
| `open tx <signature>` | Full analysis of a confirmed transaction |
| `open simulate <input>` | Simulate an unsigned transaction (base64 blob or file path) |
| `open batch <file>` | Run analysis over a list of signatures |
| `open info` | Show CLI environment info |
| `open config` | Show resolved configuration |

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
open tx <SIGNATURE>
```

## Links

- [Source code](https://github.com/OpenSubmissionn/Submission_Open)
- [Issues](https://github.com/OpenSubmissionn/Submission_Open/issues)

## License

MIT
