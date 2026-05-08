# Open

A transaction profiler and visual debugger for Solana.

## What is Open?

Open takes any Solana transaction signature and turns it into a fully decoded execution profile — showing compute unit usage, CPI call trees, account state changes, and an insight layer that flags bottlenecks automatically. AI-generated optimization suggestions are layered on top of deterministic rule-based insights so the report is useful even without an LLM.

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

Install globally from the GitHub source (requires Node.js 18+ and git):

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

Analyze a confirmed transaction on mainnet:
```bash
open tx <YOUR_TX_SIGNATURE>
```

Output as JSON:
```bash
open tx <YOUR_TX_SIGNATURE> --json
```

Save a CSV report:
```bash
open tx <YOUR_TX_SIGNATURE> --csv --output ./report.csv
```

Analyze on devnet:
```bash
open tx <YOUR_TX_SIGNATURE> --network devnet
```

Custom RPC endpoint:
```bash
open tx <YOUR_TX_SIGNATURE> --rpc https://your-rpc-url.com
```

Simulate an unsigned transaction (base64 blob or path to a file):
```bash
open simulate <BASE64_TX>
open simulate ./my-tx.b64
```

Run analysis over a list of signatures:
```bash
open batch ./signatures.json --csv --output ./batch-report.csv
```

Show registered programs and their decoder coverage:
```bash
open info
```

Show the resolved CLI configuration:
```bash
open config
```

## Commands

| Command | Description |
|---|---|
| `open tx <signature>` | Full analysis of a confirmed transaction |
| `open simulate <input>` | Simulate an unsigned transaction (base64 blob or file path) |
| `open batch <file>` | Run analysis over a list of signatures from a JSON file |
| `open info` | Show registered programs, decoder status, and coverage |
| `open config` | Show the resolved CLI configuration |

Run `open <command> --help` for the full flag list.

## CLI flags

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--json` | boolean | false | Output full analysis as JSON |
| `--csv` | boolean | false | Output a CSV row (writes a file by default) |
| `--output <path>` | string | — | Save output to a specific file path |
| `--network <name>` | mainnet \| devnet | mainnet | Solana network to use |
| `--rpc <url>` | string | — | Custom RPC URL (overrides `--network`) |
| `--no-cache` | boolean | false | Skip the IDL cache and re-fetch from chain |
| `--verbose` | boolean | false | Enable per-stage timing and debug output |

> When `--csv` is used without `--output`, the CLI writes a file named `<signature>.csv` in the current working directory.

## AI-powered insights (optional)

Open ships rule-based insights out of the box. To unlock AI-generated optimization suggestions, set one of:

| Provider | Env var | Where to get a key |
|---|---|---|
| **Groq** (free tier, recommended) | `GROQ_API_KEY` | https://console.groq.com/keys (no credit card required) |
| **Anthropic** (paid, Claude Sonnet) | `ANTHROPIC_API_KEY` | https://console.anthropic.com (~$5 minimum top-up) |

Add to your `.env`:

```bash
GROQ_API_KEY=gsk_...
```

Both providers use the same prompt and return the same shape — the CLI logs which one is active at the start of each run. Without a key, only rule-based insights render.

Power-user overrides:

| Env var | Effect |
|---|---|
| `MCP_ENDPOINT_URL` | POST the payload to a custom HTTP endpoint instead of calling the LLM directly |
| `MCP_DISABLED=1` | Skip AI entirely (rule-based insights only) |
| `MCP_MODEL` | Override the default model for the active provider |

## Configuration

To use a custom RPC by default, set `OPEN_RPC_URL`:

```bash
export OPEN_RPC_URL=https://your-rpc.example.com
open tx <SIGNATURE>
```

Open also reads `HELIUS_API_KEY` for richer transaction parsing when available. See `.env.example` for the full list.

## Project structure

```
open/
├── cli/        # CLI entry point and terminal renderer
├── services/   # Analysis engine, RPC layer, decoders
├── scripts/    # Validation and benchmark scripts
├── docs/       # Architecture, troubleshooting, schema references
└── web/        # Web frontend (work in progress, post-hackathon)
```

## Development

```bash
npm run test:all
npm run coverage
npm run lint
npm run validate:decoders
```

See `CONTRIBUTING.md` for the contribution workflow and conventions.

## Documentation

| File | Topic |
|---|---|
| `docs/Architecture_OPEN.md` | System architecture |
| `docs/Use_Cases.md` | Real-world usage scenarios |
| `docs/Troubleshooting.md` | Common errors and fixes |
| `docs/MCP_Request_Schema.md` | AI insight payload schema |
| `docs/Program_Registry_Schema.md` | Decoder registry format |
| `docs/Extensibility_Decoder.md` | How to add a new protocol decoder |

## License

MIT — see [LICENSE](LICENSE).
