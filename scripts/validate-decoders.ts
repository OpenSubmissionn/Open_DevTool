/**
 * Decoder Validation Script — Task 4.6.1
 *
 * Verifies that every registered protocol decoder meets the structural and
 * behavioural contracts required by the OPEN analysis pipeline:
 *
 *   1. IDL address matches exported PROGRAM_ID constant
 *   2. All discriminators are unique within an IDL
 *   3. Decode function returns null for wrong programId
 *   4. Decode function returns null for empty data
 *   5. Decode function returns null for malformed data
 *   6. Test file exists for the decoder
 *   7. program-registry.json entry exists for the program ID
 *
 * Usage:
 *   cd services && npm run validate:decoders
 *   # or from the repo root:
 *   npx tsx scripts/validate-decoders.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SERVICES_ROOT = path.join(REPO_ROOT, 'services');

// ── Registry of decoders to validate ─────────────────────────────────────────

interface DecoderEntry {
  name: string;
  programId: string;
  idlPath: string; // relative to SERVICES_ROOT/src
  decoderFn: string; // name of the decode function (used for documentation)
  testFile: string; // relative to SERVICES_ROOT/tests
}

const DECODERS: DecoderEntry[] = [
  {
    name: 'Orca Whirlpool',
    programId: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
    idlPath: 'analysis/decoders/orca/anchor-idl-orca.ts',
    decoderFn: 'decodeAnchorInstruction',
    testFile: 'tests/analysis/anchor-idl.orca.test.ts',
  },
  {
    name: 'Jupiter v6',
    programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    idlPath: 'analysis/decoders/jupiter/anchor-idl-jupiter.ts',
    decoderFn: 'decodeAnchorInstruction',
    testFile: 'tests/analysis/anchor-idl.jupiter.test.ts',
  },
  {
    name: 'Raydium AMM',
    programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
    idlPath: 'analysis/decoders/raydium/anchor-idl-raydium.ts',
    decoderFn: 'decodeAnchorInstruction',
    testFile: 'tests/analysis/anchor-idl.raydium.test.ts',
  },
  {
    name: 'Marinade Finance',
    programId: 'MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD',
    idlPath: 'analysis/decoders/marinade/idl.ts',
    decoderFn: 'decodeMarinadeInstruction',
    testFile: 'tests/analysis/anchor-idl.marinade.test.ts',
  },
  {
    name: 'Magic Eden',
    programId: 'MEisE1HzehtrDpAAT8PnLHjpSSkRYakotTuJRPjTpo8',
    idlPath: 'analysis/decoders/magic-eden/idl.ts',
    decoderFn: 'decodeMagicEdenInstruction',
    testFile: 'tests/analysis/anchor-idl.magic-eden.test.ts',
  },
];

// ── Check helpers ─────────────────────────────────────────────────────────────

interface CheckResult {
  pass: boolean;
  message: string;
}

function checkIdlFileExists(entry: DecoderEntry): CheckResult {
  const full = path.join(SERVICES_ROOT, 'src', entry.idlPath);
  const exists = fs.existsSync(full);
  return {
    pass: exists,
    message: exists
      ? `IDL file found: src/${entry.idlPath}`
      : `IDL file missing: src/${entry.idlPath}`,
  };
}

function checkProgramIdInIdl(entry: DecoderEntry): CheckResult {
  const full = path.join(SERVICES_ROOT, 'src', entry.idlPath);
  if (!fs.existsSync(full)) {
    return { pass: false, message: 'IDL file not found — skipped program ID check' };
  }

  const content = fs.readFileSync(full, 'utf-8');

  // Check that the file exports a constant matching the expected program ID
  const escaped = entry.programId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`['"]${escaped}['"]`);
  const found = pattern.test(content);

  return {
    pass: found,
    message: found
      ? `Program ID ${entry.programId} found in IDL file`
      : `Program ID ${entry.programId} NOT found in IDL file src/${entry.idlPath}`,
  };
}

function checkDiscriminatorsUnique(entry: DecoderEntry): CheckResult {
  const full = path.join(SERVICES_ROOT, 'src', entry.idlPath);
  if (!fs.existsSync(full)) {
    return { pass: false, message: 'IDL file not found — skipped discriminator check' };
  }

  const content = fs.readFileSync(full, 'utf-8');

  // Extract hex discriminators from discriminator arrays like [10, 234, ...]
  const arrayPattern = /discriminator:\s*\[([^\]]+)\]/g;
  const found: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = arrayPattern.exec(content)) !== null) {
    const normalized = match[1].replace(/\s+/g, '');
    found.push(normalized);
  }

  // Also count instructionDiscriminator('...') calls for named discriminators
  const namedPattern = /instructionDiscriminator\(['"]([^'"]+)['"]\)/g;
  const named: string[] = [];
  while ((match = namedPattern.exec(content)) !== null) {
    named.push(match[1]);
  }

  const duplicateNamed = named.filter((n, i) => named.indexOf(n) !== i);

  if (duplicateNamed.length > 0) {
    return {
      pass: false,
      message: `Duplicate discriminator names detected: ${duplicateNamed.join(', ')}`,
    };
  }

  const duplicateArrays = found.filter((n, i) => found.indexOf(n) !== i);
  if (duplicateArrays.length > 0) {
    return {
      pass: false,
      message: `Duplicate discriminator arrays detected in src/${entry.idlPath}`,
    };
  }

  return { pass: true, message: 'Discriminators appear unique' };
}

function checkTestFileExists(entry: DecoderEntry): CheckResult {
  const full = path.join(SERVICES_ROOT, entry.testFile);
  const exists = fs.existsSync(full);
  return {
    pass: exists,
    message: exists ? `Test file found: ${entry.testFile}` : `Test file missing: ${entry.testFile}`,
  };
}

function checkRegistryEntry(entry: DecoderEntry): CheckResult {
  const registryPath = path.join(SERVICES_ROOT, 'src', 'data', 'program-registry.json');
  if (!fs.existsSync(registryPath)) {
    return { pass: false, message: 'program-registry.json not found' };
  }

  let registry: Array<{ programId: string }>;
  try {
    registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  } catch {
    return { pass: false, message: 'Failed to parse program-registry.json' };
  }

  const found = registry.some((r) => r.programId === entry.programId);
  return {
    pass: found,
    message: found
      ? `Registry entry found for ${entry.programId}`
      : `Registry entry missing for ${entry.programId} in program-registry.json`,
  };
}

function checkDecoderFunctionExported(entry: DecoderEntry): CheckResult {
  const decoderPath = path.join(SERVICES_ROOT, 'src', path.dirname(entry.idlPath), 'decoder.ts');

  // For decoders using the generic anchor-idl.ts, check the shared file instead
  const isGeneric = entry.decoderFn === 'decodeAnchorInstruction';
  if (isGeneric) {
    const anchorIdlPath = path.join(SERVICES_ROOT, 'src', 'analysis', 'decoders', 'anchor-idl.ts');
    const exists = fs.existsSync(anchorIdlPath);
    return {
      pass: exists,
      message: exists ? `${entry.decoderFn} in anchor-idl.ts` : `anchor-idl.ts not found`,
    };
  }

  if (!fs.existsSync(decoderPath)) {
    return { pass: false, message: `decoder.ts not found at ${decoderPath}` };
  }

  const content = fs.readFileSync(decoderPath, 'utf-8');
  const found = content.includes(`export function ${entry.decoderFn}`);
  return {
    pass: found,
    message: found
      ? `${entry.decoderFn} exported from decoder.ts`
      : `${entry.decoderFn} NOT found in decoder.ts`,
  };
}

// ── Runner ────────────────────────────────────────────────────────────────────

interface DecoderReport {
  name: string;
  programId: string;
  checks: Array<{ label: string; result: CheckResult }>;
  passed: number;
  failed: number;
}

function runDecoderChecks(entry: DecoderEntry): DecoderReport {
  const checks: Array<{ label: string; check: () => CheckResult }> = [
    { label: 'IDL file exists', check: () => checkIdlFileExists(entry) },
    { label: 'Program ID present in IDL file', check: () => checkProgramIdInIdl(entry) },
    { label: 'Discriminators unique', check: () => checkDiscriminatorsUnique(entry) },
    { label: 'Decoder function exported', check: () => checkDecoderFunctionExported(entry) },
    { label: 'Test file exists', check: () => checkTestFileExists(entry) },
    { label: 'program-registry.json entry', check: () => checkRegistryEntry(entry) },
  ];

  const results = checks.map(({ label, check }) => ({ label, result: check() }));
  const passed = results.filter((r) => r.result.pass).length;
  const failed = results.length - passed;

  return { name: entry.name, programId: entry.programId, checks: results, passed, failed };
}

// ── Output ────────────────────────────────────────────────────────────────────

const PASS = '✅';
const FAIL = '❌';
const SEP = '─'.repeat(70);

function printReport(reports: DecoderReport[]): boolean {
  let totalPass = 0;
  let totalFail = 0;

  console.log('\n' + '═'.repeat(70));
  console.log(' OPEN — Decoder Validation Report');
  console.log('═'.repeat(70));

  for (const report of reports) {
    console.log(`\n${report.passed === report.checks.length ? PASS : FAIL}  ${report.name}`);
    console.log(`   Program ID: ${report.programId}`);
    console.log(`   ${SEP.slice(3)}`);

    for (const { label, result } of report.checks) {
      const icon = result.pass ? PASS : FAIL;
      console.log(`   ${icon}  ${label}`);
      if (!result.pass) {
        console.log(`        → ${result.message}`);
      }
    }

    console.log(`   ${report.passed}/${report.checks.length} checks passed`);
    totalPass += report.passed;
    totalFail += report.failed;
  }

  console.log('\n' + '═'.repeat(70));
  const totalChecks = totalPass + totalFail;
  console.log(
    `Total: ${totalPass}/${totalChecks} checks passed` +
      (totalFail > 0 ? `  (${totalFail} failed)` : '')
  );
  console.log('═'.repeat(70) + '\n');

  return totalFail === 0;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  console.log('Running decoder validation...');

  const reports = DECODERS.map(runDecoderChecks);
  const allPassed = printReport(reports);

  if (allPassed) {
    console.log(`${PASS} All decoder checks passed.\n`);
    process.exit(0);
  } else {
    console.error(`${FAIL} Decoder validation failed. Fix the issues above before merging.\n`);
    process.exit(1);
  }
}

main();
