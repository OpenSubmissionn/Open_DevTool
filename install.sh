#!/usr/bin/env sh
# opendev installer — one-liner install for Linux, macOS, and WSL.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/OpenSubmissionn/Open_DevTool/main/install.sh | sh
#
# What it does:
#   1. Detects your OS (Linux / macOS / WSL).
#   2. Verifies Node.js 18+ is installed; offers to install via nvm if not.
#   3. Clones the repo to a temp dir, builds the CLI, then installs only the
#      `cli/` package globally with --ignore-scripts (avoids the workspace
#      issue that breaks plain `npm install -g github:...`).
#   4. Smoke-tests the install with `opendev --version`.
#
# Bypass: pass --yes to skip prompts (for CI / scripted installs).

set -e

REPO_URL="https://github.com/OpenSubmissionn/Open_DevTool.git"
REPO_BRANCH="main"
MIN_NODE=20

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

say()  { printf "%s%s%s %s\n" "$DIM" "[opendev]" "$RESET" "$*"; }
ok()   { printf "%s✓%s %s\n" "$GREEN" "$RESET" "$*"; }
warn() { printf "%s!%s %s\n" "$YELLOW" "$RESET" "$*"; }
err()  { printf "%s✗%s %s\n" "$RED" "$RESET" "$*" >&2; }

# ── flags ──────────────────────────────────────────────────────────────────────
SKIP_PROMPT=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) SKIP_PROMPT=1 ;;
    --branch=*) REPO_BRANCH="${arg#*=}" ;;
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
  err "Unsupported OS. For Windows, follow the manual install in PowerShell — see README."
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
  if prompt_yes "Install Node.js 20 via nvm?"; then
    say "Installing nvm..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
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

# ── Tools required for the install workflow ────────────────────────────────────
for cmd in git npm; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    err "$cmd not found. Install $cmd and re-run."
    exit 1
  fi
done

# ── Clean up any partial previous install ──────────────────────────────────────
if command -v opendev >/dev/null 2>&1; then
  say "Removing previous opendev install..."
  npm uninstall -g opendev >/dev/null 2>&1 || true
fi

# ── Clone, build, and install ──────────────────────────────────────────────────
TMPDIR="$(mktemp -d)"
# Keep TMPDIR on error so the user can inspect; clean up only on success.
cleanup_on_success() { rm -rf "$TMPDIR"; }
cleanup_on_error()   { warn "Install dir kept for debugging: $TMPDIR"; }
trap cleanup_on_error EXIT INT TERM

say "Cloning $REPO_URL ($REPO_BRANCH)..."
git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$TMPDIR/opendev" >/dev/null 2>&1 || {
  err "Failed to clone $REPO_URL ($REPO_BRANCH)."
  exit 1
}

cd "$TMPDIR/opendev"

say "Installing workspace dependencies (this takes ~1-2 minutes)..."
if ! npm install --no-fund --no-audit --loglevel=error; then
  err "npm install failed. Re-run with verbose output:"
  err "  cd $TMPDIR/opendev && npm install"
  err "Common fixes:"
  err "  - Network issue: retry"
  err "  - Permissions: rm -rf ~/.npm/_cacache and retry"
  err "  - Node version mismatch: nvm use 20"
  exit 1
fi

say "Building CLI..."
if ! npm run build --workspace cli --loglevel=error; then
  err "Build failed. Inspect: cd $TMPDIR/opendev && npm run build --workspace cli"
  exit 1
fi

say "Installing opendev globally..."
# Install just the cli package, skipping the prepare script (already pre-built).
# This sidesteps the "Workspaces not supported for global packages" error that
# `npm install -g github:...` hits when the root package is a workspace root.
cd cli
if ! npm install -g . --ignore-scripts --no-fund --no-audit --loglevel=error; then
  err "Global install failed. Try with sudo (Linux) or run as Administrator (Windows)."
  err "Or set a user-writable npm prefix:  npm config set prefix ~/.npm-global"
  exit 1
fi

# ── Smoke test ─────────────────────────────────────────────────────────────────
# Clean up tmp dir now that everything succeeded.
trap cleanup_on_success EXIT

# Find where npm actually put the bin (its prefix may differ from the user's
# expectation — nvm, custom NPM_CONFIG_PREFIX, system vs user install, etc.).
NPM_BIN_DIR="$(npm config get prefix 2>/dev/null)/bin"
INSTALLED_BIN="$NPM_BIN_DIR/opendev"

if [ ! -x "$INSTALLED_BIN" ]; then
  err "opendev binary not found at $INSTALLED_BIN after install."
  err "Inspect: ls -la $NPM_BIN_DIR/ | grep opendev"
  exit 1
fi

ok "Installed: $INSTALLED_BIN ($("$INSTALLED_BIN" --version 2>/dev/null | tail -1 || echo unknown))"

# Detect whether $NPM_BIN_DIR is on the user's interactive PATH. We can't
# read the parent shell's PATH directly, but we inherited it — so we use
# our own as a proxy.
case ":$PATH:" in
  *":$NPM_BIN_DIR:"*)
    # Path is present in our (subshell) PATH. The parent shell that piped
    # `| sh` has the same PATH, so it should work after `hash -r` (bash
    # caches "command not found" lookups in some setups).
    printf "\n%sopendev is ready.%s\n\n" "$BOLD" "$RESET"
    printf "If your shell still says ${BOLD}opendev: command not found${RESET}, run:\n\n"
    printf "  %shash -r${RESET}                 # clear bash command cache\n" "$DIM"
    printf "  %sopendev --version${RESET}\n\n" "$DIM"
    printf "Or open a new terminal. Then try:\n\n"
    printf "  %sopendev tx <signature> --network mainnet${RESET}\n\n" "$DIM"
    ;;
  *)
    # The npm prefix bin is NOT on PATH. Tell the user what to add.
    warn "opendev was installed at: $INSTALLED_BIN"
    warn "But that directory is not on your PATH."
    printf "\nAdd this to %s~/.bashrc%s (or %s~/.zshrc%s if you use zsh):\n\n" \
      "$BOLD" "$RESET" "$BOLD" "$RESET"
    printf "  %sexport PATH=\"%s:\$PATH\"%s\n\n" "$DIM" "$NPM_BIN_DIR" "$RESET"
    printf "Then reload:\n\n"
    printf "  %ssource ~/.bashrc${RESET}\n\n" "$DIM"
    printf "Or run opendev directly:\n\n"
    printf "  %s%s --version${RESET}\n\n" "$DIM" "$INSTALLED_BIN"
    ;;
esac
