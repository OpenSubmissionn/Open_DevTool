<div align="center">

# opendev

**Visual transaction profiler and debugger for Solana.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![CI](https://github.com/OpenSubmissionn/Submission_Open/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/OpenSubmissionn/Submission_Open/actions)

Turn any Solana transaction signature into a fully decoded execution profile —
compute units, CPI call tree, account state diffs, and AI-generated optimization
suggestions on top of deterministic rule-based insights.

</div>

---

## Quick install (recommended)

One-liner that detects your OS, ensures Node.js 18+ is installed, and installs `opendev` globally:

```sh
curl -fsSL https://raw.githubusercontent.com/OpenSubmissionn/Submission_Open/main/install.sh | sh
```

Verify:

```sh
opendev --version
```

> **Windows users:** the curl installer requires WSL, Git Bash, or PowerShell with curl. Most Solana devs already have one of these. If you don't, follow the [Windows manual install](#windows-powershell) below.

---

## Manual install

### Requirements

- **Node.js 18+** (20 LTS recommended)
- **git**
- A terminal

### Linux (Ubuntu / Debian / Fedora / Arch)

```bash
# 1. Install Node 20 via nvm if you don't have it
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20

# 2. Install opendev globally from the GitHub repo
npm install -g github:OpenSubmissionn/Submission_Open

# 3. Verify
opendev --help
```

### macOS

```bash
# 1. Install Node 20 via Homebrew if you don't have it
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 2. Install opendev globally
npm install -g github:OpenSubmissionn/Submission_Open

# 3. Verify
opendev --help
```

### Windows (PowerShell)

```powershell
# 1. Install Node 20 via winget if you don't have it
winget install OpenJS.NodeJS.LTS
# Restart PowerShell so PATH picks up node

# 2. Install opendev globally
npm install -g github:OpenSubmissionn/Submission_Open

# 3. Verify
opendev --help
```

### Build from source (contributors)

```bash
git clone https://github.com/OpenSubmissionn/Submission_Open.git
cd Submission_Open
npm install
npm run build
npm link
```

---

## Quickstart

Analyze a confirmed mainnet transaction:

```bash
opendev tx 4W8cbHAkjJC3jKdFY39JFXtTakf5JK9rz6jyGPbbpKEqhweRYzwjveZasFin46WuApDeLoQRHieG3t5b3T7VXMRR --network mainnet
```

Output as JSON:
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

Run analysis over a list of signatures:
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
| `opendev simulate <input>` | Simulate an unsigned transaction (base64 blob or file path) |
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

> When `--csv` is used without `--output`, the CLI writes a file named `<signature>.csv` in the current working directory.

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

[![Contributors](https://contrib.rocks/image?repo=OpenSubmissionn/Submission_Open)](https://github.com/OpenSubmissionn/Submission_Open/graphs/contributors)

## License

[MIT](LICENSE)
