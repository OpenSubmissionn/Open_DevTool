import { BorshCoder } from "@coral-xyz/anchor";
import type { ParsedInstruction } from "../../types";

import {
  MARINADE_IDL,
  MARINADE_PROGRAM_ID,
} from "./idl";

// Initialize a Borsh coder using the Marinade IDL.
// This is responsible for decoding instruction data.
const coder = new BorshCoder(MARINADE_IDL);

// Standard output shape aligned with the analysis pipeline
export interface MarinadeDecodedInstruction {
  instructionName: string; // Decoded instruction name (e.g. "deposit")
  programId: string;       // Marinade program ID
  accounts: string[];      // Accounts involved in the instruction
  rawData: string;         // Original encoded instruction data
  decodedData?: Record<string, unknown>; // Decoded arguments
}

// Main decoder function for Marinade instructions
export function decodeMarinadeInstruction(
  ix: ParsedInstruction
): MarinadeDecodedInstruction | null {

  // Ensure the instruction belongs to the Marinade program
  if (ix.programId !== MARINADE_PROGRAM_ID) {
    return null;
  }

  // Validate instruction data
  if (!ix.data || typeof ix.data !== "string") {
    return null;
  }

  let buffer: Buffer;

  try {
    // Attempt to decode base64 (default encoding from RPC responses)
    buffer = Buffer.from(ix.data, "base64");
  } catch {
    return null;
  }

  // Anchor instructions must have at least 8 bytes (discriminator)
  if (buffer.length < 8) {
    return null;
  }

  let decoded;

  try {
    // Decode instruction using Anchor BorshCoder
    decoded = coder.instruction.decode(buffer);
  } catch {
    return null;
  }

  // If decoding fails, return null
  if (!decoded) return null;

  // Return normalized decoded instruction
  return {
    instructionName: decoded.name,
    programId: MARINADE_PROGRAM_ID,
    accounts: ix.accounts,
    rawData: ix.data,
    decodedData: decoded.data as Record<string, unknown>,
  };
}