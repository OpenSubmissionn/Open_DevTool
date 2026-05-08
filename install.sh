#!/usr/bin/env sh
# opendev installer — one-liner install for Linux, macOS, and WSL.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/OpenSubmissionn/Submission_Open/main/install.sh | sh
#
# What it does:
#   1. Detects your OS (Linux / macOS / WSL).
#   2. Verifies Node.js 18+ is installed; prompts to install via nvm if not.
#   3. Installs `opendev` globally via npm from the GitHub repo.
#   4. Smoke-tests the install with `opendev --version`.
#
# Bypass: pass --yes to skip prompts (for CI / scripted installs).
#         pass --node-source=brew to prefer Homebrew over nvm on macOS.

set -e

REPO="github:OpenSubmissionn/Submission_Open"
MIN_NODE=18

# ── pretty output ──────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD="$(printf '\033[1m')"
  DIM="$(printf '\033[2m')"
  GREEN="$(printf '\033[32m')"
  YELLOW="$(printf '\033[33m')"
  RED="$(printf '\033[31m')"
  RESET="$(printf '\033[0m')"
else
  BOLD=""; DIM=""; GREEN=""; YELLOW=""; RED=""; RESET=""
fi

say()  { printf "%s%s%s\n" "$DIM" "[opendev]" "$RESET $*"; }
ok()   { printf "%s✓%s %s\n" "$GREEN" "$RESET" "$*"; }
warn() { printf "%s!%s %s\n" "$YELLOW" "$RESET" "$*"; }
err()  { printf "%s✗%s %s\n" "$RED" "$RESET" "$*" >&2; }

# ── flags ──────────────────────────────────────────────────────────────────────
SKIP_PROMPT=0
NODE_SOURCE=""
for arg in "$@"; do
  case "$arg" in
    --yes|-y) SKIP_PROMPT=1 ;;
    --node-source=*) NODE_SOURCE="${arg#*=}" ;;
  esac
done

prompt_yes() {
  if [ "$SKIP_PROMPT" -eq 1 ]; then return 0; fi
  printf "%s%s%s [Y/n] " "$BOLD" "$1" "$RESET"
  read -r answer
  case "$answer" in n|N|no|NO) return 1 ;; *) return 0 ;; esac
}

# ── OS detection ───────────────────────────────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Linux*)   if grep -qi microsoft /proc/version 2>/dev/null; then echo "wsl"; else echo "linux"; fi ;;
    Darwin*)  echo "macos" ;;
    *)        echo "unknown" ;;
  esac
}

OS="$(detect_os)"
say "Detected OS: ${BOLD}${OS}${RESET}"

if [ "$OS" = "unknown" ]; then
  err "Unsupported OS. For Windows, use the manual install in PowerShell — see README."
  exit 1
fi

# ── Node check ─────────────────────────────────────────────────────────────────
node_version() {
  command -v node >/dev/null 2>&1 || return 1
  node -p "process.versions.node.split('.')[0]"
}

NODE_MAJOR="$(node_version 2>/dev/null || echo 0)"

if [ "$NODE_MAJOR" -lt "$MIN_NODE" ]; then
  warn "Node.js $MIN_NODE+ required (found ${NODE_MAJOR:-none})."
  if prompt_yes "Install Node.js $MIN_NODE via nvm?"; then
    say "Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    # Source nvm into the current shell so the next commands work without a restart
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck disable=SC1091
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    nvm install 20
    nvm use 20
    ok "Node.js $(node --version) installed."
  else
    err "Aborting. Install Node.js 18+ manually and re-run this installer."
    exit 1
  fi
else
  ok "Node.js $(node --version) detected."
fi

# ── Install opendev ────────────────────────────────────────────────────────────
say "Installing opendev from $REPO..."
npm install -g "$REPO"

# ── Smoke test ─────────────────────────────────────────────────────────────────
if command -v opendev >/dev/null 2>&1; then
  ok "Installed: $(opendev --version 2>/dev/null || echo opendev)"
  printf "\n%sopendev is ready.%s Try:\n\n  %sopendev tx <signature> --network mainnet%s\n\n" \
    "$BOLD" "$RESET" "$DIM" "$RESET"
else
  warn "opendev binary not on PATH yet. You may need to restart your shell or add"
  warn "  \$(npm config get prefix)/bin to your PATH."
fi
