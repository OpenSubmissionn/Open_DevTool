# Open

A transaction profiler and visual debugger for Solana.

## What is Open?

Open takes any Solana transaction signature and turns it into a fully decoded execution profile — showing compute unit usage, CPI call trees, account state changes, and an insight layer that flags bottlenecks automatically.

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
| `--network` | mainnet or devnet | mainnet | Solana network to use |
| `--rpc` | string | — | Custom RPC URL, overrides --network |
| `--verbose` | boolean | false | Enable debug output |
| `--output` | string | — | Save output to a file path |
| `--csv` | boolean | false | Write a CSV report instead of printing to stdout |

#### Install from source (for contributors)

```bash
git clone https://github.com/OpenSubmissionn/Submission_Open.git
cd Submission_Open
npm install
npm run build
npm link
```

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
