import { Command } from 'commander';
import chalk from 'chalk';
import registryData from '../../../services/src/data/program-registry.json';

interface BenchmarkRef {
  framework: string;
  operations: string[];
}

interface ProgramEntry {
  name: string;
  programId: string;
  framework: string;
  idl: string | null;
  decoderStatus: 'complete' | 'partial' | 'planned' | 'none';
  benchmark: BenchmarkRef | null;
  coverage: number;
  lastUpdated: string;
}

// Static JSON import (matches the pattern in services/src/solana/programs.ts).
// The bundler inlines program-registry.json into the build output, so the
// command works the same whether run via `tsx` (dev) or the bundled
// `cli/dist/open.js` (post-build) — no fs/path resolution at runtime.
//
// Normalises every entry against ProgramEntry — fills sensible fallbacks for
// missing fields and dedupes by programId — so a partially-filled or
// accidentally-duplicated registry entry never crashes the renderer.
function loadRegistry(): ProgramEntry[] {
  const raw = registryData as Partial<ProgramEntry>[];
  const seen = new Set<string>();
  const out: ProgramEntry[] = [];
  for (const entry of raw) {
    if (!entry.programId) continue; // skip headerless rows
    if (seen.has(entry.programId)) continue; // dedupe by programId
    seen.add(entry.programId);
    out.push({
      name: entry.name ?? '(unnamed)',
      programId: entry.programId,
      framework: entry.framework ?? 'unknown',
      idl: entry.idl ?? null,
      decoderStatus: entry.decoderStatus ?? 'none',
      benchmark: entry.benchmark ?? null,
      coverage: typeof entry.coverage === 'number' ? entry.coverage : 0,
      lastUpdated: entry.lastUpdated ?? '—',
    });
  }
  return out;
}

function colorStatus(status: ProgramEntry['decoderStatus']): string {
  switch (status) {
    case 'complete':
      return chalk.green(status);
    case 'partial':
      return chalk.yellow(status);
    case 'planned':
      return chalk.blue(status);
    case 'none':
      return chalk.gray(status);
    default:
      return chalk.gray(String(status));
  }
}

function colorCoverage(coverage: number): string {
  const text = `${coverage}%`.padStart(4);
  if (coverage >= 100) return chalk.green(text);
  if (coverage >= 66) return chalk.yellow(text);
  if (coverage >= 33) return chalk.cyan(text);
  return chalk.gray(text);
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function renderTable(entries: ProgramEntry[]): void {
  const cols = {
    name: 32,
    framework: 10,
    coverage: 8,
    decoder: 12,
    benchmark: 8,
  };

  const header =
    chalk.bold('Name'.padEnd(cols.name)) +
    chalk.bold('Framework'.padEnd(cols.framework)) +
    chalk.bold('Coverage'.padStart(cols.coverage)) +
    '  ' +
    chalk.bold('Decoder'.padEnd(cols.decoder)) +
    chalk.bold('Benchmark'.padEnd(cols.benchmark));

  const sep = chalk.gray(
    '─'.repeat(cols.name + cols.framework + cols.coverage + cols.decoder + cols.benchmark + 2)
  );

  console.log('');
  console.log(chalk.bold('OPEN — Program Registry'));
  console.log(sep);
  console.log(header);
  console.log(sep);

  for (const entry of entries) {
    const row =
      truncate(entry.name, cols.name).padEnd(cols.name) +
      entry.framework.padEnd(cols.framework) +
      colorCoverage(entry.coverage).padStart(cols.coverage) +
      '  ' +
      colorStatus(entry.decoderStatus).padEnd(cols.decoder + 10) +
      (entry.benchmark ? chalk.green('  ✓') : chalk.gray('  —'));
    console.log(row);
  }

  console.log(sep);
  const total = entries.length;
  const ready = entries.filter((e) => e.coverage === 100).length;
  console.log(chalk.dim(`${ready}/${total} programs at full coverage  •  ${total} total entries`));
  console.log('');
}

function renderDetail(entry: ProgramEntry): void {
  console.log('');
  console.log(chalk.bold(entry.name));
  console.log(chalk.gray('─'.repeat(entry.name.length)));
  console.log(`${chalk.dim('Program ID:    ')}${entry.programId}`);
  console.log(`${chalk.dim('Framework:     ')}${entry.framework}`);
  console.log(`${chalk.dim('Coverage:      ')}${colorCoverage(entry.coverage).trim()}`);
  console.log(`${chalk.dim('Decoder:       ')}${colorStatus(entry.decoderStatus)}`);
  console.log(`${chalk.dim('IDL:           ')}${entry.idl ?? chalk.gray('(none)')}`);
  if (entry.benchmark) {
    console.log(
      `${chalk.dim('Benchmark:     ')}${entry.benchmark.framework} → ${entry.benchmark.operations.join(', ')}`
    );
  } else {
    console.log(`${chalk.dim('Benchmark:     ')}${chalk.gray('(none)')}`);
  }
  console.log(`${chalk.dim('Last updated:  ')}${entry.lastUpdated}`);
  console.log('');
}

function findEntry(entries: ProgramEntry[], query: string): ProgramEntry | undefined {
  const q = query.toLowerCase();
  return entries.find(
    (e) => e.programId === query || e.name.toLowerCase() === q || e.name.toLowerCase().includes(q)
  );
}

export const registerInfoCommand = (program: Command) => {
  program
    .command('info')
    .description('Show OPEN capabilities — programs supported, decoder status, coverage')
    .argument('[query]', 'Program ID or name to show in detail')
    .action((query: string | undefined) => {
      const registry = loadRegistry();

      if (query) {
        const entry = findEntry(registry, query);
        if (!entry) {
          console.error(chalk.red(`No program matches "${query}"`));
          console.log(chalk.dim(`Run "open info" to list all available programs.`));
          process.exit(1);
        }
        renderDetail(entry);
      } else {
        renderTable(registry);
      }
    });
};
