import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Validates that the discriminator in each new IDL matches the raw bytes
// of the corresponding instruction in a real recorded transaction.

interface IxData {
  programIdIndex: number;
  data: string; // base58
  accounts: number[];
}

interface FixtureCase {
  label: string;
  fixture: string;
  programId: string;
  expectedInstruction: string;
}

const CASES: FixtureCase[] = [
  {
    label: 'Magic Eden v2 (MMM)',
    fixture: 'realMagicEdenTx.json',
    programId: 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K',
    expectedInstruction: 'mip1_sell',
  },
  {
    label: 'Squads Protocol V4',
    fixture: 'realSquadsTx.json',
    programId: 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf',
    expectedInstruction: 'spending_limit_use',
  },
];

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(s: string): Uint8Array {
  let num = 0n;
  for (const ch of s) {
    const idx = BASE58_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base58 char: ${ch}`);
    num = num * 58n + BigInt(idx);
  }
  const bytes: number[] = [];
  while (num > 0n) {
    bytes.push(Number(num & 0xffn));
    num >>= 8n;
  }
  // Leading zeros
  for (const ch of s) {
    if (ch === '1') bytes.push(0);
    else break;
  }
  return new Uint8Array(bytes.reverse());
}

function discriminator(name: string): Uint8Array {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function hex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join(' ');
}

function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const fixturesDir = path.join(__dirname, '..', 'services', 'tests', 'fixtures');

  console.log('Validating decoders against real transaction fixtures...\n');

  let allPassed = true;

  for (const c of CASES) {
    const tx = JSON.parse(fs.readFileSync(path.join(fixturesDir, c.fixture), 'utf-8'));
    const accountKeys: string[] = tx.transaction.message.accountKeys;
    const instructions: IxData[] = tx.transaction.message.instructions;

    // Find the top-level instruction targeting our program
    const ix = instructions.find((i) => accountKeys[i.programIdIndex] === c.programId);
    if (!ix) {
      console.log(`[FAIL] ${c.label}: no top-level instruction for ${c.programId}`);
      allPassed = false;
      continue;
    }

    const dataBytes = base58Decode(ix.data);
    const observedDisc = dataBytes.subarray(0, 8);
    const expectedDisc = discriminator(c.expectedInstruction);

    const match = bytesEqual(observedDisc, expectedDisc);
    if (match) {
      console.log(`[PASS] ${c.label}`);
      console.log(`       instruction: ${c.expectedInstruction}`);
      console.log(`       discriminator: ${hex(observedDisc)}`);
      console.log(`       fixture sig: ${tx.transaction.signatures[0].slice(0, 20)}...`);
    } else {
      console.log(`[FAIL] ${c.label}`);
      console.log(`       expected (${c.expectedInstruction}): ${hex(expectedDisc)}`);
      console.log(`       observed in tx data:                  ${hex(observedDisc)}`);
      allPassed = false;
    }
    console.log('');
  }

  if (allPassed) {
    console.log('All decoder discriminators match real transaction bytes.');
    process.exit(0);
  } else {
    console.error('Decoder validation failed.');
    process.exit(1);
  }
}

main();
