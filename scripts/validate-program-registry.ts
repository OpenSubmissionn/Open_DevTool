import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ---------- Schema ----------

type Framework = 'Anchor' | 'Native' | 'Pinocchio';
type DecoderStatus = 'complete' | 'partial' | 'planned' | 'none';

interface BenchmarkRef {
  framework: string;
  operations: string[];
}

interface ProgramEntry {
  name: string;
  programId: string;
  framework: Framework;
  idl: string | null;
  decoderStatus: DecoderStatus;
  benchmark: BenchmarkRef | null;
  coverage: number;
  lastUpdated: string;
}

interface BenchmarkEntry {
  operation: string;
  framework: string;
  estimatedCU: number;
  confidence: string;
  source: string;
}

const FRAMEWORKS: Framework[] = ['Anchor', 'Native', 'Pinocchio'];
const DECODER_STATUSES: DecoderStatus[] = ['complete', 'partial', 'planned', 'none'];
const BASE58_PROGRAM_ID = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Validation ----------

function validateEntry(
  entry: any,
  index: number,
  benchmarks: BenchmarkEntry[],
  repoRoot: string,
  seenIds: Set<string>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const required = [
    'name',
    'programId',
    'framework',
    'idl',
    'decoderStatus',
    'benchmark',
    'coverage',
    'lastUpdated',
  ];

  for (const key of required) {
    if (!(key in entry)) errors.push(`Missing required field: "${key}"`);
  }
  if (errors.length > 0) return { valid: false, errors };

  if (typeof entry.name !== 'string' || entry.name.length === 0) {
    errors.push(`"name" must be a non-empty string`);
  }
  if (typeof entry.programId !== 'string' || !BASE58_PROGRAM_ID.test(entry.programId)) {
    errors.push(`"programId" must be a valid base58 string (32-44 chars)`);
  }
  if (!FRAMEWORKS.includes(entry.framework)) {
    errors.push(`"framework" must be one of: ${FRAMEWORKS.join(', ')}`);
  }
  if (entry.idl !== null && typeof entry.idl !== 'string') {
    errors.push(`"idl" must be a string path or null`);
  }
  if (!DECODER_STATUSES.includes(entry.decoderStatus)) {
    errors.push(`"decoderStatus" must be one of: ${DECODER_STATUSES.join(', ')}`);
  }
  if (typeof entry.coverage !== 'number' || entry.coverage < 0 || entry.coverage > 100) {
    errors.push(`"coverage" must be a number between 0 and 100`);
  }
  if (typeof entry.lastUpdated !== 'string' || !ISO_DATE.test(entry.lastUpdated)) {
    errors.push(`"lastUpdated" must be ISO date (YYYY-MM-DD)`);
  }

  // Duplicate programId check
  if (typeof entry.programId === 'string') {
    if (seenIds.has(entry.programId)) {
      errors.push(`Duplicate programId: ${entry.programId}`);
    } else {
      seenIds.add(entry.programId);
    }
  }

  // IDL file existence check
  if (typeof entry.idl === 'string') {
    const idlPath = path.join(repoRoot, entry.idl);
    if (!fs.existsSync(idlPath)) {
      errors.push(`"idl" path does not exist on disk: ${entry.idl}`);
    }
  }

  // Benchmark validation
  if (entry.benchmark !== null) {
    if (typeof entry.benchmark !== 'object') {
      errors.push(`"benchmark" must be an object or null`);
    } else {
      const b = entry.benchmark;
      if (typeof b.framework !== 'string') {
        errors.push(`"benchmark.framework" must be a string`);
      } else if (b.framework !== entry.framework) {
        errors.push(
          `"benchmark.framework" (${b.framework}) does not match entry framework (${entry.framework})`
        );
      }
      if (!Array.isArray(b.operations) || b.operations.length === 0) {
        errors.push(`"benchmark.operations" must be a non-empty array`);
      } else {
        for (const op of b.operations) {
          const exists = benchmarks.some(
            (be) => be.operation === op && be.framework === entry.framework
          );
          if (!exists) {
            errors.push(
              `"benchmark.operations" references "${op}" for framework "${entry.framework}" but no matching entry found in framework-benchmarks.json`
            );
          }
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`\nEntry ${index} (${entry.name ?? '<unnamed>'}):`);
    errors.forEach((e) => console.error(`  - ${e}`));
  }

  return { valid: errors.length === 0, errors };
}

// ---------- Coverage computation ----------

function computeCoverage(entry: ProgramEntry, repoRoot: string): number {
  const signals = [
    entry.idl !== null && fs.existsSync(path.join(repoRoot, entry.idl)),
    entry.decoderStatus === 'complete' || entry.decoderStatus === 'partial',
    entry.benchmark !== null,
  ];

  // Native programs without IDLs still get full credit when decoder is complete
  if (entry.framework === 'Native' && entry.idl === null && entry.decoderStatus === 'complete') {
    signals[0] = true;
  }

  const trueCount = signals.filter(Boolean).length;
  return Math.round((trueCount / signals.length) * 100);
}

// ---------- Main ----------

function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.join(__dirname, '..');

  const writeMode = process.argv.includes('--write');

  console.log('Validating program registry...');
  if (writeMode) console.log('  Mode: --write (will update coverage and lastUpdated)');

  const registryPath = path.join(repoRoot, 'services', 'src', 'data', 'program-registry.json');
  const benchmarksPath = path.join(
    repoRoot,
    'services',
    'src',
    'data',
    'framework-benchmarks.json'
  );

  let registry: ProgramEntry[];
  let benchmarks: BenchmarkEntry[];

  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  } catch {
    console.error(`Failed to read or parse: ${registryPath}`);
    process.exit(1);
  }

  try {
    benchmarks = JSON.parse(fs.readFileSync(benchmarksPath, 'utf-8'));
  } catch {
    console.error(`Failed to read or parse: ${benchmarksPath}`);
    process.exit(1);
  }

  if (!Array.isArray(registry)) {
    console.error('Registry root must be an array');
    process.exit(1);
  }

  // Validate
  const seenIds = new Set<string>();
  let allValid = true;
  for (let i = 0; i < registry.length; i++) {
    const result = validateEntry(registry[i], i, benchmarks, repoRoot, seenIds);
    if (!result.valid) allValid = false;
  }

  if (!allValid) {
    console.error('\nValidation failed.');
    process.exit(1);
  }

  // Compute coverage
  const today = new Date().toISOString().slice(0, 10);
  let mutated = false;

  console.log('\nCoverage report:');
  for (const entry of registry) {
    const computed = computeCoverage(entry, repoRoot);
    const drift = computed !== entry.coverage;

    const marker = drift ? (writeMode ? 'updated' : 'drift') : 'ok';
    console.log(
      `  [${marker.padEnd(7)}] ${entry.name.padEnd(32)} ${String(entry.coverage).padStart(3)}% -> ${String(computed).padStart(3)}%`
    );

    if (drift && writeMode) {
      entry.coverage = computed;
      entry.lastUpdated = today;
      mutated = true;
    }
  }

  if (writeMode && mutated) {
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n', 'utf-8');
    console.log(`\nRegistry updated: ${registryPath}`);
  } else if (!writeMode) {
    const driftCount = registry.filter((e) => computeCoverage(e, repoRoot) !== e.coverage).length;
    if (driftCount > 0) {
      console.log(`\n${driftCount} entries have drift. Run with --write to update.`);
    }
  }

  console.log('\nValidation passed.');
  process.exit(0);
}

main();
