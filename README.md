# Open

A transaction profiler and visual debugger for Solana.

## What is Open?

Open takes any Solana transaction signature and turns it into a fully decoded execution profile — showing compute unit usage, CPI call trees, account state changes, and an insight layer that flags bottlenecks automatically. AI-generated optimization suggestions are layered on top of deterministic rule-based insights so the report is useful even without an LLM.

Open ships in two flavors — pick whichever fits your workflow:

- **Web** — paste a signature in the browser, zero install. Live at **https://open-frontier-azure.vercel.app**
- **CLI** — full power in the terminal: scripting, JSON/CSV output, custom RPCs

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

## How to use

You can use Open in two ways. Both share the same analysis pipeline — CPI tree, CU profile, account diffs, insights, and a Solscan-style execution log.

### Option 1 — Web (no install)

The fastest way to try Open.

1. Open **https://open-frontier-azure.vercel.app**
2. Paste any mainnet or devnet transaction signature into the input
3. Click **Analyze**

If you don't have a signature handy, click **Live mainnet sample** to pull a fresh Jupiter v6 transaction directly from the chain.

### Option 2 — CLI

Best for scripting, batch jobs, custom RPCs, and JSON/CSV output.

#### Install

The CLI runs on Windows, macOS, and Linux. You need **Node.js 18 or newer** and **git** on your system before installing.

**Windows**

In **PowerShell** or **Command Prompt**:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Or download the installers manually: [nodejs.org](https://nodejs.org/) and [git-scm.com/download/win](https://git-scm.com/download/win). Restart the terminal after installing so the new `node`, `npm`, and `git` are on your `PATH`.

**macOS**

With [Homebrew](https://brew.sh/):

```bash
brew install node git
```

Or download Node from [nodejs.org](https://nodejs.org/); git ships with the Xcode Command Line Tools (`xcode-select --install`).

**Linux (Debian / Ubuntu)**

```bash
sudo apt update
sudo apt install -y nodejs npm git
```

If `node --version` returns less than 18, install a current LTS via [nvm](https://github.com/nvm-sh/nvm):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
nvm install --lts
```

For Fedora/RHEL use `sudo dnf install nodejs git`; for Arch use `sudo pacman -S nodejs npm git`.

**Then, on any OS, install the CLI globally:**

```bash
npm install -g github:OpenSubmissionn/Submission_Open
```

This makes the `open` command available globally. Verify:

```bash
open --help
```

> **macOS users:** macOS ships its own `open` command. Depending on your `PATH` order, the npm-installed `open` may shadow it. If that bothers you, invoke with `npx --package=github:OpenSubmissionn/Submission_Open open ...` instead.

#### Run

Analyze a mainnet transaction (default network):
```bash
open tx <YOUR_TX_SIGNATURE>
```

Full analysis as JSON (pipe into `jq`, save to file, etc.):
```bash
open tx <YOUR_TX_SIGNATURE> --json
```

Devnet:
```bash
open tx <YOUR_TX_SIGNATURE> --network devnet
```

Custom RPC endpoint:
```bash
open tx <YOUR_TX_SIGNATURE> --rpc https://your-rpc-url.com
```

CSV output (writes `<signature>.csv` in the current directory):
```bash
open tx <YOUR_TX_SIGNATURE> --csv
```

CSV to a specific path:
```bash
open tx <YOUR_TX_SIGNATURE> --csv --output ./my-tx-report.csv
```

#### Flags

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
