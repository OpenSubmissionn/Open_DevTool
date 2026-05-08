# Open

A transaction profiler and visual debugger for Solana.

## What is Open?

Open takes any Solana transaction signature and turns it into a fully decoded execution profile — showing compute unit usage, CPI call trees, account state changes, and an insight layer that flags bottlenecks automatically.

## Team Members: 
<table align="center">
  <tr>
    <td align="center">
      <a href="https://www.linkedin.com/in/ana-cristina-jardim/">
        <img src="docs/assets/anacristina.jpg"
        style="width:120px; height:120px; object-fit:cover; border-radius:8px;"
        alt="Ana Cristina Jardim"/><br>
        <sub><b>Ana Cristina Jardim</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://www.linkedin.com/in/ana-j%C3%BAlia-ribeiro/">
        <img src="docs/assets/anajulia.jpg"
        style="width:120px; height:120px; object-fit:cover; border-radius:8px;"
        alt="Ana Júlia Ribeiro"/><br>
        <sub><b>Ana Júlia Ribeiro</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://www.linkedin.com/in/emanuelly-dias-2a0480305/">
        <img src="docs/assets/emanuelly.jpg"
        style="width:120px; height:120px; object-fit:cover; border-radius:8px;"
        alt="Emanuelly Cantarelli Dias"/><br>
        <sub><b>Emanuelly Cantarelli Dias</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://www.linkedin.com/in/mirela-bianchi-608601254/">
        <img src="docs/assets/mirela.jpg"
        style="width:120px; height:120px; object-fit:cover; border-radius:8px;"
        alt="Mirela Schneider Bianchi"/><br>
        <sub><b>Mirela Schneider Bianchi</b></sub>
      </a>
    </td>
    <td align="center">
      <a href="https://www.linkedin.com/in/nicolezanin/">
        <img src="docs/assets/nicole.jpg"
        style="width:120px; height:120px; object-fit:cover; border-radius:8px;"
        alt="Nicole Zanin Silva"/><br>
        <sub><b>Nicole Zanin Silva</b></sub>
      </a>
    </td>
  </tr>
</table>

## Installation

Install globally with one command (requires Node.js 18+ and git):

```bash
npm install -g github:OpenSubmissionn/Submission_Open
```

This makes the `open` command available globally. To verify:

```bash
open --help
```

> **macOS users:** macOS ships its own `open` command. Depending on your `PATH` order, the npm-installed `open` may shadow it. If that bothers you, invoke with `npx --package=github:OpenSubmissionn/Submission_Open open ...` instead.

### Install from source (for contributors)

```bash
git clone https://github.com/OpenSubmissionn/Submission_Open.git
cd Submission_Open
npm install
npm run build
npm link
```

## Quickstart

Example 1 — Full analysis as JSON:
```bash
open tx <YOUR_TX_SIGNATURE> --json
```

Example 2 — Analyze on devnet:
```bash
open tx <YOUR_TX_SIGNATURE> --network devnet
```

Example 3 — Custom RPC endpoint:
```bash
open tx <YOUR_TX_SIGNATURE> --rpc https://your-rpc-url.com
```

Example 4 — CSV output (writes a file):
```bash
open tx <YOUR_TX_SIGNATURE> --network mainnet --csv
```

Example 5 — CSV output to explicit path:
```bash
open tx <YOUR_TX_SIGNATURE> --network mainnet --csv --output ./my-tx-report.csv
```

Note: when `--csv` is used without `--output`, the CLI writes a file named `<signature>.csv` in the current working directory.

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
