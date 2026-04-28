import { BorshCoder, type Idl } from "@coral-xyz/anchor";
import type { ParsedInstruction } from "../types";

// Anchor IDLs for supported protocols
import {
  ORCA_WHIRLPOOL_IDL,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  instructionDiscriminator,
} from "./anchor-idl-orca";

import {
  JUPITER_V6_IDL,
  JUPITER_V6_PROGRAM_ID,
} from "./anchor-idl-jupiter";

import {
  RAYDIUM_AMM_IDL,
  RAYDIUM_AMM_PROGRAM_ID,
} from "./anchor-idl-raydium";

// Re-export protocol constants and IDLs for external usage
export {
  ORCA_WHIRLPOOL_IDL,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  JUPITER_V6_IDL,
  JUPITER_V6_PROGRAM_ID,
  RAYDIUM_AMM_IDL,
  RAYDIUM_AMM_PROGRAM_ID,
  instructionDiscriminator,
};

// Default registry mapping programId to its IDL
const DEFAULT_IDL_BY_PROGRAM: Record<string, Idl> = {
  [ORCA_WHIRLPOOL_PROGRAM_ID]: ORCA_WHIRLPOOL_IDL,
  [JUPITER_V6_PROGRAM_ID]: JUPITER_V6_IDL,
  [RAYDIUM_AMM_PROGRAM_ID]: RAYDIUM_AMM_IDL,
};

// Output shape for decoded Anchor instructions
export interface DecodedAnchorInstruction {
  instructionName: string;
  anchorInstructionName: string;
  type: string;
  programId: string;
  accounts: string[];
  rawData: string;
  decodedData?: Record<string, unknown>;
  discriminator?: string;
  action?: string;
  inputEncoding?: "hex" | "base64";
  decoderWarning?: string;
  decoderType?: "anchor" | "custom";
  confidence?: "high" | "low";
  resolvedAccounts?: Array<{ name: string; pubkey: string }>;
  accountsStrictMatch?: boolean;
  [key: string]: unknown;
}

export interface DecodeAnchorOptions {
  allowNonAnchorPrograms?: boolean;
}

// Converts snake_case instruction names into camelCase
function toCamelCaseInstructionName(name: string): string {
  if (!name.includes("_")) return name;

  const parts = name.split("_").filter(Boolean);

  return parts
    .map((part, index) =>
      index === 0
        ? part.toLowerCase()
        : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join("");
}

// Basic validation for Solana public keys (base58 format)
function isValidPublicKey(value: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

// Ensures accounts array is valid
function areValidAccounts(accounts: unknown): accounts is string[] {
  return (
    Array.isArray(accounts) &&
    accounts.every((a) => typeof a === "string" && a.length > 0)
  );
}

// Maps instruction names into a normalized classification system
const INSTRUCTION_CLASSIFICATION: Record<
  string,
  { type: string; action?: string }
> = {
  swap: { type: "swap" },
  swapBaseIn: { type: "swap_pool", action: "exact_in" },
  swapBaseOut: { type: "swap_pool", action: "exact_out" },
  deposit: { type: "liquidity_pool", action: "deposit" },
  withdraw: { type: "liquidity_pool", action: "withdraw" },
  initialize: { type: "pool_initialization" },
  route: { type: "swap_aggregation", action: "exact_in" },
};

// Returns classification metadata for a given instruction name
function classifyInstruction(name: string) {
  return INSTRUCTION_CLASSIFICATION[name] ?? { type: "unknown" };
}

// Detects and decodes instruction data from hex or base64 encoding
function decodeInstructionData(
  data: string
): { buffer: Buffer; encoding: "hex" | "base64" } | null {
  const trimmed = data.trim();
  if (!trimmed) return null;

  // Attempt hex decoding
  if (trimmed.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    return { buffer: Buffer.from(trimmed, "hex"), encoding: "hex" };
  }

  // Attempt base64 decoding
  try {
    return { buffer: Buffer.from(trimmed, "base64"), encoding: "base64" };
  } catch {
    return null;
  }
}

// Cache for BorshCoders to avoid rebuilding layouts repeatedly
const CODER_CACHE = new Map<string, BorshCoder>();

function getCachedCoder(programId: string, idl: Idl) {
  // FIX: Idl does not guarantee "name"
  const idlName =
    (idl as any).name ?? idl.metadata?.name ?? "unknown";

  const key = `${programId}:${idlName}`;

  if (CODER_CACHE.has(key)) return CODER_CACHE.get(key)!;

  const coder = new BorshCoder(idl);
  CODER_CACHE.set(key, coder);
  return coder;
}

// Finds the instruction in the IDL using the discriminator
function findInstructionByDiscriminator(idl: Idl, disc: Buffer) {
  return idl.instructions.find((ix) =>
    Buffer.from(ix.discriminator).equals(disc)
  );
}

// Main decoding function for Anchor-based instructions
export function decodeAnchorInstruction(
  programId: string,
  ix: ParsedInstruction,
  idl?: Idl
): DecodedAnchorInstruction | null {
  // Validate input parameters
  if (!isValidPublicKey(programId)) return null;
  if (!ix || !areValidAccounts(ix.accounts)) return null;

  // Resolve IDL from registry or provided argument
  const targetIdl = idl ?? DEFAULT_IDL_BY_PROGRAM[programId];
  if (!targetIdl) return null;

  // Decode raw instruction data
  const parsed = decodeInstructionData(ix.data);
  if (!parsed || parsed.buffer.length < 8) return null;

  // Extract discriminator (first 8 bytes)
  const discriminator = parsed.buffer.subarray(0, 8);

  // Match instruction in IDL
  const idlIx = findInstructionByDiscriminator(targetIdl, discriminator);
  if (!idlIx) return null;

  // Decode instruction using Anchor BorshCoder
  const coder = getCachedCoder(programId, targetIdl);

  let decoded;
  try {
    decoded = coder.instruction.decode(parsed.buffer);
  } catch {
    return null;
  }

  if (!decoded) return null;

  // Normalize instruction name and classify
  const instructionName = toCamelCaseInstructionName(decoded.name);
  const { type, action } = classifyInstruction(instructionName);

  return {
    instructionName,
    anchorInstructionName: decoded.name,
    type,
    programId,
    accounts: ix.accounts,
    rawData: ix.data,
    decodedData: decoded.data as Record<string, unknown>,
    discriminator: discriminator.toString("hex"),
    inputEncoding: parsed.encoding,
    decoderType: "anchor",
    confidence: "high",
    ...(action ? { action } : {}),
  };
}