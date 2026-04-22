# Open

A transaction profiler and visual debugger for Solana.

## What is Open?

Open takes any Solana transaction signature and turns it into a fully decoded execution profile — showing compute unit usage, CPI call trees, account state changes, and an insight layer that flags bottlenecks automatically.

## Installation

```bash
git clone https://github.com/Mirelasbianchi/open.git
cd open
npm install
npm run build
```

## Quickstart

Example 1 — Full analysis as JSON:
```bash
npm run dev:cli -- tx <YOUR_TX_SIGNATURE> --json
```

Example 2 — Analyze on devnet:
```bash
npm run dev:cli -- tx <YOUR_TX_SIGNATURE> --network devnet
```

Example 3 — Custom RPC endpoint:
```bash
npm run dev:cli -- tx <YOUR_TX_SIGNATURE> --rpc https://your-rpc-url.com
```

## CLI flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--json` | boolean | false | Output full analysis as JSON |
| `--network` | mainnet or devnet | mainnet | Solana network to use |
| `--rpc` | string | — | Custom RPC URL, overrides --network |
| `--verbose` | boolean | false | Enable debug output |
| `--output` | string | — | Save output to a file path |

## Project structure

open/
├── cli/        # CLI entry point and terminal renderer
├── services/   # Analysis engine, RPC layer, decoders
├── docs/       # Architecture and program registry docs
├── programs/   # On-chain program code
└── web/        # Web frontend

## Development

```bash
npm run test:all
npm run coverage
npm run lint
```

## Contributing

See CONTRIBUTING.md for guidelines.

## License

MIT
