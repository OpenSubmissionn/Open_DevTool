#!/usr/bin/env bash
# generate-decoder.sh — scaffolds a new protocol decoder folder
#
# Usage:
#   bash scripts/generate-decoder.sh <protocol-name> <program-id>
#
# Example:
#   bash scripts/generate-decoder.sh tensor TNSRxcUxoT9xBG3de7A4QJ1Zd9xiNnsFr3CpysHpbzt

set -euo pipefail

PROTOCOL="${1:-}"
PROGRAM_ID="${2:-}"

if [[ -z "$PROTOCOL" || -z "$PROGRAM_ID" ]]; then
  echo "Usage: bash scripts/generate-decoder.sh <protocol-name> <program-id>"
  echo "Example: bash scripts/generate-decoder.sh tensor TNSRxcUxoT9xBG3de7A4QJ1Zd9xiNnsFr3CpysHpbzt"
  exit 1
fi

# Derive name variants
PROTOCOL_LOWER="$(echo "$PROTOCOL" | tr '[:upper:]' '[:lower:]' | tr '-' '_')"
PROTOCOL_PASCAL="$(echo "$PROTOCOL" | sed 's/\(^\|[-_]\)\([a-z]\)/\U\2/g')"
PROTOCOL_UPPER="$(echo "$PROTOCOL_LOWER" | tr '[:lower:]' '[:upper:]')"

DECODER_DIR="services/src/analysis/decoders/${PROTOCOL_LOWER}"
TEST_FILE="services/tests/analysis/anchor-idl.${PROTOCOL_LOWER}.test.ts"

if [[ -d "$DECODER_DIR" ]]; then
  echo "Error: Directory already exists: $DECODER_DIR"
  exit 1
fi

mkdir -p "$DECODER_DIR"

echo "Scaffolding decoder for: ${PROTOCOL_PASCAL} (${PROGRAM_ID})"

# ── idl.ts ────────────────────────────────────────────────────────────────────
cat > "${DECODER_DIR}/idl.ts" << EOF
import { instructionDiscriminator } from '../orca/anchor-idl-orca';
import type { Idl } from '@coral-xyz/anchor';

export const ${PROTOCOL_UPPER}_PROGRAM_ID = '${PROGRAM_ID}';

export const ${PROTOCOL_UPPER}_IDL: Idl = {
  address: ${PROTOCOL_UPPER}_PROGRAM_ID,
  metadata: { name: '${PROTOCOL_LOWER}', version: '1.0.0', spec: '0.1.0' },
  instructions: [
    // TODO: add instructions
    // {
    //   name: 'exampleInstruction',
    //   discriminator: instructionDiscriminator('example_instruction'),
    //   accounts: [],
    //   args: [],
    // },
  ],
  accounts: [],
  errors: [],
  types: [],
  events: [],
};
EOF

# ── decoder.ts ────────────────────────────────────────────────────────────────
cat > "${DECODER_DIR}/decoder.ts" << EOF
import { decodeAnchorInstruction, type DecodedAnchorInstruction } from '../anchor-idl';
import { ${PROTOCOL_UPPER}_PROGRAM_ID, ${PROTOCOL_UPPER}_IDL } from './idl';
import type { ParsedInstruction } from '../../types';

export interface ${PROTOCOL_PASCAL}DecodedInstruction extends DecodedAnchorInstruction {
  // TODO: add typed fields extracted from Borsh args, e.g.:
  // amount?: bigint;
}

const SEMANTIC_MAP: Record<string, { type: string; action?: string }> = {
  // TODO: map camelCase instruction names to semantic types/actions, e.g.:
  // exampleInstruction: { type: 'example', action: 'execute' },
};

export function decode${PROTOCOL_PASCAL}Instruction(
  ix: ParsedInstruction
): ${PROTOCOL_PASCAL}DecodedInstruction | null {
  if (ix.programId !== ${PROTOCOL_UPPER}_PROGRAM_ID) return null;

  const base = decodeAnchorInstruction(${PROTOCOL_UPPER}_PROGRAM_ID, ix, ${PROTOCOL_UPPER}_IDL);
  if (!base) return null;

  const semantic = SEMANTIC_MAP[base.instructionName] ?? { type: 'unknown' };
  const data = base.decodedData ?? {};

  const result: ${PROTOCOL_PASCAL}DecodedInstruction = {
    ...base,
    type: semantic.type,
    ...(semantic.action ? { action: semantic.action } : {}),
  };

  // TODO: extract typed fields from data, e.g.:
  // if (typeof data.amount === 'bigint' || typeof data.amount === 'number') {
  //   result.amount = BigInt(data.amount as number);
  // }

  void data;
  return result;
}
EOF

# ── index.ts ──────────────────────────────────────────────────────────────────
cat > "${DECODER_DIR}/index.ts" << EOF
export * from './idl';
export * from './decoder';
EOF

# ── test stub ─────────────────────────────────────────────────────────────────
cat > "${TEST_FILE}" << EOF
import { BorshCoder } from '@coral-xyz/anchor';
import { describe, expect, it } from 'vitest';
import { decode${PROTOCOL_PASCAL}Instruction } from '../../src/analysis/decoders/${PROTOCOL_LOWER}/decoder';
import { ${PROTOCOL_UPPER}_IDL, ${PROTOCOL_UPPER}_PROGRAM_ID } from '../../src/analysis/decoders/${PROTOCOL_LOWER}/idl';
import type { ParsedInstruction } from '../../src/analysis/types';

// const coder = new BorshCoder(${PROTOCOL_UPPER}_IDL);
void BorshCoder;

describe('decode${PROTOCOL_PASCAL}Instruction - hardening', () => {
  it('returns null for wrong programId', () => {
    const ix: ParsedInstruction = {
      programId: 'WrongProgram11111111111111111111111111111111',
      programName: '${PROTOCOL_PASCAL}',
      accounts: [],
      data: '00'.repeat(16),
      depth: 0,
      innerInstructions: [],
    };
    expect(decode${PROTOCOL_PASCAL}Instruction(ix)).toBeNull();
  });

  it('returns null for empty data', () => {
    const ix: ParsedInstruction = {
      programId: ${PROTOCOL_UPPER}_PROGRAM_ID,
      programName: '${PROTOCOL_PASCAL}',
      accounts: [],
      data: '',
      depth: 0,
      innerInstructions: [],
    };
    expect(decode${PROTOCOL_PASCAL}Instruction(ix)).toBeNull();
  });

  // TODO: add fixture tests for each instruction once the IDL is filled
});
EOF

echo ""
echo "Created:"
echo "  ${DECODER_DIR}/idl.ts"
echo "  ${DECODER_DIR}/decoder.ts"
echo "  ${DECODER_DIR}/index.ts"
echo "  ${TEST_FILE}"
echo ""
echo "Next steps:"
echo "  1. Fill in instructions in ${DECODER_DIR}/idl.ts"
echo "  2. Add semantic mappings in ${DECODER_DIR}/decoder.ts"
echo "  3. Register in services/src/analysis/decoders/anchor-idl.ts:"
echo "       import { ${PROTOCOL_UPPER}_IDL, ${PROTOCOL_UPPER}_PROGRAM_ID } from './${PROTOCOL_LOWER}/idl';"
echo "       DEFAULT_IDL_BY_PROGRAM[${PROTOCOL_UPPER}_PROGRAM_ID] = ${PROTOCOL_UPPER}_IDL;"
echo "  4. Add export to services/src/analysis/decoders/index.ts:"
echo "       export * from './${PROTOCOL_LOWER}';"
echo "  5. Add entry to services/src/data/program-registry.json"
echo "  6. Write fixture tests in ${TEST_FILE}"
echo "  7. Run: cd services && npm run validate:decoders"
