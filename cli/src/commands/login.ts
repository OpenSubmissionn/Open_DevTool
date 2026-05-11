/**
 * `opendev login [provider]`
 *
 * Browser-assisted token entry — the realistic "OAuth-ish" flow for providers
 * that don't expose a public OAuth client for third-party CLIs (which is most
 * of them, including Anthropic and Groq today).
 *
 * Flow:
 *   1. Open the provider's API-key page in the user's browser.
 *   2. Prompt for the key with masked input (so it doesn't leak into
 *      shell history the way `config set-key <provider> <key>` does).
 *   3. Validate the key against the provider's API.
 *   4. Persist via the existing credential store.
 *
 * This is the same model `gh auth login --with-token` and `vercel login`
 * use — not OAuth PKCE, but it's the best we can do until providers ship
 * proper OAuth, and it removes the two main UX paper cuts: typing a key on
 * the command line, and not knowing if you pasted the right one.
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  envVarFor,
  isProvider,
  maskKey,
  setCredential,
  SUPPORTED_PROVIDERS,
  type Provider,
} from '../config/credentials';

interface ProviderTarget {
  name: string;
  /** Where the user creates / copies the key. */
  keysUrl: string;
  /** Cheap GET endpoint to test the key — no token cost. */
  validateUrl: string;
  /** Auth header for the validation request. */
  buildAuthHeaders: (key: string) => Record<string, string>;
}

const PROVIDER_TARGETS: Record<Provider, ProviderTarget> = {
  groq: {
    name: 'Groq',
    keysUrl: 'https://console.groq.com/keys',
    validateUrl: 'https://api.groq.com/openai/v1/models',
    buildAuthHeaders: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  anthropic: {
    name: 'Anthropic',
    keysUrl: 'https://console.anthropic.com/settings/keys',
    // /v1/models is GET-only, free, and only requires a valid key.
    validateUrl: 'https://api.anthropic.com/v1/models',
    buildAuthHeaders: (key) => ({
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    }),
  },
};

/**
 * Open a URL in the user's default browser. Best-effort, never throws.
 *
 * spawn() can fail asynchronously (ENOENT) which a try/catch around the
 * call does NOT catch — the error is emitted on the ChildProcess via the
 * 'error' event. Without an attached handler, Node treats it as an
 * unhandled 'error' event and crashes the process with a stack trace.
 * User @anajuliarrod hit exactly this on a WSL distro that didn't ship
 * wslview. Every spawn here attaches a noop 'error' handler, and we walk
 * a fallback chain so a missing tool just moves on to the next option.
 */
function openInBrowser(url: string): void {
  const trySpawn = (cmd: string, args: string[]): boolean => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
      // Critical: a 'error' event on a child with no listener crashes Node.
      child.on('error', () => {
        /* Swallow ENOENT etc; fallback chain will move on. */
      });
      child.unref();
      return true;
    } catch {
      return false;
    }
  };

  const platform = process.platform;
  if (platform === 'darwin') {
    trySpawn('open', [url]);
    return;
  }
  if (platform === 'win32') {
    // `start` is a cmd.exe builtin; the empty "" is required as the window
    // title so cmd doesn't interpret the URL as one.
    trySpawn('cmd', ['/c', 'start', '""', url]);
    return;
  }
  // Linux family — including WSL. We can't rely on which tool is installed,
  // so try each in turn. On WSL without wslview, falling back to cmd.exe
  // works because /mnt/c/Windows/System32 is on PATH; that opens the user's
  // Windows-side default browser. The ChildProcess 'error' handler above
  // means a missing binary fails silently instead of crashing.
  const isWsl = !!process.env.WSL_DISTRO_NAME;
  // On WSL, prefer cmd.exe — always present, opens the user's Windows-side
  // default browser, no extra packages needed. wslview is nicer when
  // installed (it picks an X11 browser if WSLg is running) but isn't shipped
  // by default in every distro, as @anajuliarrod's machine showed.
  const candidates = isWsl
    ? ['cmd.exe', 'wslview', 'xdg-open']
    : ['xdg-open', 'gnome-open', 'kde-open'];
  for (const cmd of candidates) {
    // For cmd.exe under WSL, use the `start` builtin form. Otherwise raw URL.
    const args = cmd === 'cmd.exe' ? ['/c', 'start', '""', url] : [url];
    if (trySpawn(cmd, args)) return;
  }
}

/**
 * Prompt for a secret with masked input (each char shown as `*`). Falls back
 * to a plain line read if stdin is not a TTY — useful for piping in tests or
 * CI, where the key comes from another command.
 */
function readSecret(promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    stdout.write(promptText);

    if (!stdin.isTTY) {
      // Piped stdin (CI, tests, `echo $KEY | opendev login --no-validate`).
      // Read one line and resolve. The `received` flag guards against an
      // edge case where the 'close' event handler could race with 'line'
      // and resolve the Promise with an empty string before the line value
      // landed — observed once during early development, kept as a belt.
      const rl = createInterface({ input: stdin, terminal: false });
      let received = false;
      rl.once('line', (line) => {
        received = true;
        rl.close();
        resolve(line.trim());
      });
      rl.once('close', () => {
        if (!received) resolve('');
      });
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let buffer = '';
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          cleanup();
          stdout.write('\n');
          resolve(buffer);
          return;
        }
        if (ch === '\x03') {
          // Ctrl-C
          cleanup();
          stdout.write('\n');
          reject(new Error('Cancelled by user.'));
          return;
        }
        if (ch === '\x7f' || ch === '\b') {
          // Backspace / DEL
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        // Ignore unprintable control characters (arrow keys, escape sequences).
        if (ch < ' ') continue;
        buffer += ch;
        stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

/** Hit the provider's cheapest authenticated endpoint to confirm the key. */
async function validateKey(
  provider: Provider,
  key: string
): Promise<{ ok: boolean; error?: string }> {
  const target = PROVIDER_TARGETS[provider];
  try {
    const res = await fetch(target.validateUrl, {
      method: 'GET',
      headers: target.buildAuthHeaders(key),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: `Key rejected (HTTP ${res.status}). Did you paste the full value?`,
      };
    }
    if (res.status === 429) {
      // Key is valid, we're just rate-limited. Treat as success.
      return { ok: true };
    }
    return { ok: false, error: `${target.name} returned HTTP ${res.status}.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Network error contacting ${target.name}: ${msg}` };
  }
}

interface LoginOptions {
  browser: boolean;
  validate: boolean;
}

export const registerLoginCommand = (program: Command) => {
  program
    .command('login')
    .description(
      'Browser-assisted login for an AI provider. Opens the keys page,\n' +
        '  prompts for the key (masked), validates it, and saves it to\n' +
        '  ~/.opendev/credentials.json so future `opendev tx` runs have AI insights.\n\n' +
        '  Examples:\n' +
        '    opendev login              # defaults to groq (free tier)\n' +
        '    opendev login anthropic    # if you have a paid key\n' +
        '    opendev login groq --no-browser   # CI / SSH session\n\n' +
        '  Compare with `opendev config set-key`, which takes the key as a CLI\n' +
        '  argument and is suited for scripts. `login` is the interactive path.'
    )
    .argument(
      '[provider]',
      `which provider (${SUPPORTED_PROVIDERS.join(' | ')}). Defaults to groq.`,
      'groq'
    )
    .option('--no-browser', 'Skip opening the browser; print the URL instead')
    .option('--no-validate', 'Skip the API test call after pasting (saves anyway)')
    .action(async (provider: string, options: LoginOptions) => {
      if (!isProvider(provider)) {
        console.error(
          chalk.red(`Unknown provider "${provider}". Supported: ${SUPPORTED_PROVIDERS.join(', ')}`)
        );
        process.exit(1);
      }
      const target = PROVIDER_TARGETS[provider as Provider];

      console.log();
      console.log(chalk.bold(`Logging in to ${target.name}.`));
      console.log();
      if (options.browser) {
        console.log(`Opening ${chalk.cyan(target.keysUrl)} in your browser...`);
        openInBrowser(target.keysUrl);
        console.log(chalk.gray(`(If it didn't open, copy that URL manually.)`));
      } else {
        console.log(`Open this URL in any browser:`);
        console.log(`  ${chalk.cyan(target.keysUrl)}`);
      }
      console.log();
      console.log(chalk.gray('Sign in, create a new API key, then paste it below.'));
      console.log(chalk.gray('Input is hidden — you will see asterisks as you type.'));
      console.log();

      let key: string;
      try {
        key = await readSecret(chalk.bold(`${target.name} API key: `));
      } catch (e) {
        console.error(chalk.red((e as Error).message));
        process.exit(1);
      }

      if (!key || key.length < 8) {
        console.error(chalk.red('Key looks too short or empty. Nothing saved.'));
        process.exit(1);
      }

      if (options.validate) {
        process.stdout.write(chalk.gray(`Verifying with ${target.name}... `));
        const result = await validateKey(provider as Provider, key);
        if (!result.ok) {
          console.log(chalk.red('failed.'));
          console.error(chalk.red(`  ${result.error}`));
          console.error(
            chalk.gray('  Pass --no-validate to save the key anyway (not recommended).')
          );
          process.exit(1);
        }
        console.log(chalk.green('ok.'));
      }

      setCredential(provider as Provider, key);
      console.log();
      console.log(`${chalk.green('✓')} Saved ${chalk.bold(target.name)} key (${maskKey(key)}).`);
      console.log(
        chalk.gray(`  Stored as ${envVarFor(provider as Provider)} in ~/.opendev/credentials.json.`)
      );
      console.log();
      console.log(`Try it:  ${chalk.bold('opendev tx <signature>')}`);
    });
};
