// One-shot codemod: add explicit `.js` extensions to relative imports inside
// services/src so the compiled output works under Node ESM strict resolution
// (which Vercel's @vercel/node v3 enforces — it does not bundle).
//
// Resolution rules per file at <importer>:
//   from './foo'        →  './foo.js'         if <importer>/../foo.ts exists
//   from './foo'        →  './foo/index.js'   if <importer>/../foo/ has index.ts
//   from './foo.json'   →  unchanged           (JSON is preserved)
//   from '@solana/...'  →  unchanged           (package import)
//
// Usage:  node scripts/fix-esm-extensions.mjs services/src
//
// Idempotent: re-running won't double-suffix anything.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.argv[2] ?? 'services/src';

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|mts)$/.test(entry.name)) yield full;
  }
}

function resolveImport(importerDir, spec) {
  const candidate = path.resolve(importerDir, spec);
  // file: <spec>.ts / .tsx / .mts
  for (const ext of ['.ts', '.tsx', '.mts']) {
    if (fs.existsSync(candidate + ext)) return spec + '.js';
  }
  // dir: <spec>/index.ts
  for (const ext of ['.ts', '.tsx', '.mts']) {
    if (fs.existsSync(path.join(candidate, 'index' + ext))) {
      return spec.replace(/\/?$/, '/index.js');
    }
  }
  return null; // can't resolve — leave alone
}

const IMPORT_RE =
  /(\b(?:import|export)(?:\s+type)?\s+(?:[\s\S]*?)\s+from\s*|\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]+?)\2/g;

let changedFiles = 0;
let touchedImports = 0;
const unresolved = [];

for (const file of walk(ROOT)) {
  const src = fs.readFileSync(file, 'utf8');
  const importerDir = path.dirname(file);

  const next = src.replace(IMPORT_RE, (match, prefix, quote, spec) => {
    if (/\.(js|mjs|cjs|json)$/.test(spec)) return match; // already has extension
    const resolved = resolveImport(importerDir, spec);
    if (!resolved) {
      unresolved.push({ file, spec });
      return match;
    }
    touchedImports++;
    return `${prefix}${quote}${resolved}${quote}`;
  });

  if (next !== src) {
    fs.writeFileSync(file, next);
    changedFiles++;
  }
}

console.log(`fixed ${touchedImports} imports across ${changedFiles} files`);
if (unresolved.length) {
  console.log(`\nUNRESOLVED (left alone — manual review needed):`);
  for (const u of unresolved) console.log(`  ${u.file}: '${u.spec}'`);
}
