/**
 * Decoder template — copy this folder to add a new protocol decoder.
 *
 * Steps:
 *   1. Copy services/src/analysis/decoders/template-idl.ts to
 *      services/src/analysis/decoders/<protocol>/idl.ts
 *   2. Replace all TEMPLATE_ placeholders with real values.
 *   3. Create decoder.ts and index.ts following this file's structure.
 *   4. Register in anchor-idl.ts and decoders/index.ts.
 *   5. Run: npm run validate:decoders
 *
 * See docs/Extensibility_Decoder.md for the full guide.
 */

import { instructionDiscriminator } from './orca/anchor-idl-orca.js';
import type { Idl } from '@coral-xyz/anchor';

// ── 1. Program ID ─────────────────────────────────────────────────────────────

export const TEMPLATE_PROGRAM_ID = 'REPLACE_WITH_BASE58_PROGRAM_ID_44_CHARS_____';

// ── 2. IDL ────────────────────────────────────────────────────────────────────

export const TEMPLATE_IDL: Idl = {
  // Must match TEMPLATE_PROGRAM_ID exactly.
  address: TEMPLATE_PROGRAM_ID,
  metadata: {
    name: 'template_protocol', // snake_case
    version: '1.0.0',
    spec: '0.1.0',
  },
  instructions: [
    // ── Example instruction ────────────────────────────────────────────────
    {
      name: 'exampleInstruction',
      // Compute with instructionDiscriminator('example_instruction')
      // (pass the snake_case IDL name, not the camelCase JS name)
      discriminator: instructionDiscriminator('example_instruction'),
      accounts: [
        { name: 'authority', writable: false, signer: true },
        { name: 'targetAccount', writable: true, signer: false },
        { name: 'systemProgram', writable: false, signer: false },
      ],
      args: [
        // Common Borsh types: 'u8','u16','u32','u64','u128','i64','bool','publicKey','bytes'
        { name: 'amount', type: 'u64' },
        { name: 'bump', type: 'u8' },
      ],
    },
    // Add more instructions here…
  ],
  accounts: [],
  errors: [],
  types: [],
  events: [],
};

// ── 3. Decoder (goes in decoder.ts) ───────────────────────────────────────────
//
// import { decodeAnchorInstruction, type DecodedAnchorInstruction } from '../anchor-idl';
// import { TEMPLATE_PROGRAM_ID, TEMPLATE_IDL } from './idl';
// import type { ParsedInstruction } from '../../types';
//
// export interface TemplateDecodedInstruction extends DecodedAnchorInstruction {
//   amount?: bigint;   // typed fields extracted from Borsh args
// }
//
// const SEMANTIC_MAP: Record<string, { type: string; action?: string }> = {
//   exampleInstruction: { type: 'example', action: 'execute' },
// };
//
// export function decodeTemplateInstruction(
//   ix: ParsedInstruction
// ): TemplateDecodedInstruction | null {
//   if (ix.programId !== TEMPLATE_PROGRAM_ID) return null;
//
//   const base = decodeAnchorInstruction(TEMPLATE_PROGRAM_ID, ix, TEMPLATE_IDL);
//   if (!base) return null;
//
//   const semantic = SEMANTIC_MAP[base.instructionName] ?? { type: 'unknown' };
//   const data = base.decodedData ?? {};
//
//   const result: TemplateDecodedInstruction = {
//     ...base,
//     type: semantic.type,
//     ...(semantic.action ? { action: semantic.action } : {}),
//   };
//
//   if (typeof data.amount === 'bigint' || typeof data.amount === 'number') {
//     result.amount = BigInt(data.amount as number);
//   }
//
//   return result;
// }
