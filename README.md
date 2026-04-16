# Open
A transaction profiler and visual debugger for Solana.

[npm] [TypeScript] [Solana]

## What is Open?
Open turns any Solana transaction signature into a fully decoded execution profile — CU flame graph, CPI call tree, account state diffs, structured logs, and an insight layer that flags bottlenecks.

## Installation
```bash
# Clone the repo
git clone https://github.com/Mirelasbianchi/open.git
cd open

# Install dependencies
npm install

# Build (from root)
npm run build
```

## Quickstart — 3 examples
Example 1 — Analyze a transaction (JSON output):
```bash
npm run dev:cli -- tx <YOUR_TX_SIGNATURE> --json
```

Example 2 — Analyze on devnet:
```bash
npm run dev:cli -- tx <YOUR_TX_SIGNATURE> --network devnet
```

Example 3 — Use a custom RPC endpoint:
```bash
npm run dev:cli -- tx <YOUR_TX_SIGNATURE> --rpc https://your-rpc-url.com
```

## CLI flags
| Flag | Type | Default | Description |
| --- | --- | --- | --- |
| `--json` | boolean | false | Output full analysis as JSON |
| `--network` | "mainnet" \| "devnet" | "mainnet" | Solana network to use |
| `--rpc` | string | — | Custom RPC URL (overrides --network) |
| `--verbose` | boolean | false | Enable debug output |
| `--output` | string | — | Save output to a file path |

## Project structure
```
cli/       - CLI entrypoint and command layer
services/  - Solana data fetch, analysis, and decoder services
docs/      - Architecture and development documentation
programs/  - on-chain program definitions and fixtures
web/       - web UI and visualization tooling
```

## Development
```bash
# Run tests
npm run test:all

# Run coverage
npm run coverage

# Lint
npm run lint
```

## Contributing
See CONTRIBUTING.md for guidelines.

## License
MIT
