import { Command } from 'commander';
import chalk from 'chalk';
import { config } from '../config/loader';
import {
  credentialsPath,
  envVarFor,
  getCredential,
  isProvider,
  maskKey,
  removeCredential,
  setCredential,
  SUPPORTED_PROVIDERS,
  type Provider,
} from '../config/credentials';

export const registerConfigCommand = (program: Command) => {
  const configCommand = program.command('config').description('Manage opendev CLI configuration');

  // ── set-key <provider> <key> ──────────────────────────────────────────────
  configCommand
    .command('set-key')
    .description(
      'Save an AI provider API key to ~/.opendev/credentials.json (chmod 600).\n' +
        '\n' +
        '  Supported providers: ' +
        SUPPORTED_PROVIDERS.join(', ') +
        '\n\n' +
        '  Examples:\n' +
        '    opendev config set-key groq gsk_xxxxxxxxxxxxxxxx\n' +
        '    opendev config set-key anthropic sk-ant-xxxxxxxxxxxx\n\n' +
        '  Get a key:\n' +
        '    Groq (free):     https://console.groq.com/keys\n' +
        '    Anthropic (paid): https://console.anthropic.com'
    )
    .argument('<provider>', `which AI provider (${SUPPORTED_PROVIDERS.join(' | ')})`)
    .argument('<key>', 'the API key')
    .action((provider: string, key: string) => {
      if (!isProvider(provider)) {
        console.error(
          chalk.red(`Unknown provider "${provider}". Supported: ${SUPPORTED_PROVIDERS.join(', ')}.`)
        );
        process.exit(1);
      }
      if (!key || key.length < 8) {
        console.error(chalk.red('Key looks too short. Did you paste the full value?'));
        process.exit(1);
      }
      setCredential(provider as Provider, key);
      console.log(
        `${chalk.green('✓')} Saved ${chalk.bold(provider)} key (${maskKey(key)}) to ${credentialsPath()}`
      );
      console.log(chalk.gray(`  This will be used as ${envVarFor(provider as Provider)}.`));
    });

  // ── get-key [provider] ─────────────────────────────────────────────────────
  configCommand
    .command('get-key')
    .description('Show which AI keys are configured (values are masked).')
    .argument('[provider]', 'limit to a single provider (optional)')
    .action((provider: string | undefined) => {
      const targets = provider
        ? isProvider(provider)
          ? [provider]
          : []
        : [...SUPPORTED_PROVIDERS];

      if (provider && !isProvider(provider)) {
        console.error(
          chalk.red(`Unknown provider "${provider}". Supported: ${SUPPORTED_PROVIDERS.join(', ')}.`)
        );
        process.exit(1);
      }

      console.log(`Credentials store: ${credentialsPath()}\n`);

      for (const p of targets) {
        const fromStore = getCredential(p);
        const fromEnv = process.env[envVarFor(p)];
        let source: string;
        let value: string;
        if (fromEnv && fromEnv !== fromStore) {
          source = chalk.yellow('env');
          value = maskKey(fromEnv);
        } else if (fromStore) {
          source = chalk.green('store');
          value = maskKey(fromStore);
        } else {
          source = chalk.gray('—');
          value = chalk.gray('not set');
        }
        console.log(`  ${chalk.bold(p.padEnd(10))} ${source.padEnd(20)} ${value}`);
      }
    });

  // ── remove-key <provider> ──────────────────────────────────────────────────
  configCommand
    .command('remove-key')
    .description('Delete an AI provider key from the credentials store.')
    .argument('<provider>', `which provider (${SUPPORTED_PROVIDERS.join(' | ')})`)
    .action((provider: string) => {
      if (!isProvider(provider)) {
        console.error(
          chalk.red(`Unknown provider "${provider}". Supported: ${SUPPORTED_PROVIDERS.join(', ')}.`)
        );
        process.exit(1);
      }
      const removed = removeCredential(provider as Provider);
      if (removed) {
        console.log(
          `${chalk.green('✓')} Removed ${chalk.bold(provider)} from ${credentialsPath()}`
        );
      } else {
        console.log(`${chalk.gray('—')} ${chalk.bold(provider)} was not in the store.`);
      }
    });

  // ── set rpc <url> ──────────────────────────────────────────────────────────
  configCommand
    .command('set-rpc')
    .description('Set the default Solana RPC URL (currently shown only — persistence WIP)')
    .argument('<url>', 'the Solana RPC URL to use')
    .action((url: string) => {
      console.log(chalk.yellow('⚠ RPC URL persistence is not yet implemented.'));
      console.log(`Received: ${url}`);
      console.log(`Currently loaded RPC (from .env): ${config.rpcUrl ?? '(none)'}`);
      console.log('');
      console.log(chalk.gray('For now, set OPEN_RPC_URL in your shell or in a .env file.'));
    });
};
