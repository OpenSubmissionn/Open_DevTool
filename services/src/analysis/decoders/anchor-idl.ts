import { BorshCoder, type Idl } from '@coral-xyz/anchor';
import type { ParsedInstruction } from '../types';

import {
  ORCA_WHIRLPOOL_IDL,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  instructionDiscriminator,
} from './orca/anchor-idl-orca';

import { JUPITER_V6_IDL, JUPITER_V6_PROGRAM_ID } from './jupiter/anchor-idl-jupiter';

import { RAYDIUM_AMM_IDL, RAYDIUM_AMM_PROGRAM_ID } from './raydium/anchor-idl-raydium';

export {
  ORCA_WHIRLPOOL_IDL,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  JUPITER_V6_IDL,
  JUPITER_V6_PROGRAM_ID,
  RAYDIUM_AMM_IDL,
  RAYDIUM_AMM_PROGRAM_ID,
  instructionDiscriminator,
};

const DEFAULT_IDL_BY_PROGRAM: Record<string, Idl> = {
  [ORCA_WHIRLPOOL_PROGRAM_ID]: ORCA_WHIRLPOOL_IDL,
  [JUPITER_V6_PROGRAM_ID]: JUPITER_V6_IDL,
  [RAYDIUM_AMM_PROGRAM_ID]: RAYDIUM_AMM_IDL,
};

// Programs that use custom binary layouts on-chain despite having an Anchor-compatible IDL.
const NON_ANCHOR_BINARY_PROGRAMS = new Set<string>([RAYDIUM_AMM_PROGRAM_ID]);

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
  inputEncoding?: 'hex' | 'base64';
  decoderWarning?: string;
  decoderType?: 'anchor' | 'custom';
  confidence?: 'high' | 'low';
  resolvedAccounts?: Array<{ name: string; pubkey: string }>;
  accountsStrictMatch?: boolean;
}

function toCamelCaseInstructionName(name: string): string {
  return name.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// Accepts hex (even-length, all hex chars) first, then falls back to base64.
function decodeInstructionData(
  data: string
): { buffer: Buffer; encoding: 'hex' | 'base64' } | null {
  const trimmed = data.trim();
  if (!trimmed) return null;

  if (trimmed.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, 'hex');
    if (buf.length > 0) return { buffer: buf, encoding: 'hex' };
  }

  if (/^[A-Za-z0-9+/]+=*$/.test(trimmed)) {
    try {
      const buf = Buffer.from(trimmed, 'base64');
      if (buf.length > 0) return { buffer: buf, encoding: 'base64' };
    } catch {
      // fall through
    }
  }

  return null;
}

const CODER_CACHE = new Map<string, BorshCoder>();

function getCoder(programId: string, idl: Idl) {
  if (!CODER_CACHE.has(programId)) {
    CODER_CACHE.set(programId, new BorshCoder(idl));
  }
  return CODER_CACHE.get(programId)!;
}

function resolveAccounts(
  idlIx: any,
  accounts: string[]
): {
  resolved: { name: string; pubkey: string }[];
  strict: boolean;
} {
  const resolved = accounts.map((pubkey, i) => ({
    name: idlIx.accounts?.[i]?.name ?? `unknown_${i}`,
    pubkey,
  }));

  return {
    resolved,
    strict: idlIx.accounts?.length === accounts.length,
  };
}

function classify(programId: string, name: string) {
  if (programId === JUPITER_V6_PROGRAM_ID) {
    if (name === 'route') return { type: 'swap_aggregation', action: 'exact_in' };
    if (name === 'exactOutRoute') return { action: 'exact_out', type: 'swap_aggregation' };
    if (name === 'sharedAccountsRoute') return { action: 'exact_in', type: 'swap_aggregation' };
    if (name === 'sharedAccountsExactOutRoute')
      return { action: 'exact_out', type: 'swap_aggregation' };
    if (name === 'setTokenLedger') return { type: 'token_ledger' };
  }

  if (programId === ORCA_WHIRLPOOL_PROGRAM_ID) {
    if (name === 'initializePool') return { type: 'pool_initialization' };
    if (name === 'swap') return { type: 'swap' };
    if (name === 'openPosition') return { action: 'open' };
    if (name === 'openPositionWithMetadata') return { action: 'open' };
    if (name === 'closePosition') return { action: 'close' };
    if (name === 'increaseLiquidity') return { action: 'increase' };
    if (name === 'decreaseLiquidity') return { action: 'decrease' };
  }

  if (programId === RAYDIUM_AMM_PROGRAM_ID) {
    if (name === 'initialize') return { type: 'pool_initialization' };
    if (name === 'deposit') return { action: 'deposit' };
    if (name === 'withdraw') return { action: 'withdraw' };
    if (name === 'swapBaseIn') return { action: 'exact_in' };
    if (name === 'swapBaseOut') return { action: 'exact_out' };
  }

  return { type: 'unknown' };
}

export function decodeAnchorInstruction(
  programId: string,
  ix: ParsedInstruction,
  idl?: Idl,
  opts?: { allowNonAnchorPrograms?: boolean }
): DecodedAnchorInstruction | null {
  if (!ix?.data || !Array.isArray(ix.accounts)) return null;

  // Reject when the instruction's programId explicitly mismatches the target.
  if (ix.programId && ix.programId !== programId) return null;

  const targetIdl = idl ?? DEFAULT_IDL_BY_PROGRAM[programId];
  if (!targetIdl) return null;

  const parsed = decodeInstructionData(ix.data);
  if (!parsed || parsed.buffer.length < 8) return null;

  const discriminator = parsed.buffer.subarray(0, 8);
  const discriminatorHex = discriminator.toString('hex');

  // When the caller explicitly opts out of non-Anchor compat mode, return
  // a custom-decoder sentinel instead of attempting Anchor decoding.
  if (NON_ANCHOR_BINARY_PROGRAMS.has(programId) && opts?.allowNonAnchorPrograms === false) {
    return {
      instructionName: 'unknown',
      anchorInstructionName: 'unknown',
      type: 'unknown',
      programId,
      accounts: ix.accounts,
      rawData: ix.data,
      discriminator: discriminatorHex,
      inputEncoding: parsed.encoding,
      decoderType: 'custom',
      confidence: 'low',
    };
  }

  const idlIx = targetIdl.instructions.find((i) =>
    Buffer.from(i.discriminator).equals(discriminator)
  );

  if (!idlIx) {
    return {
      instructionName: 'unknown',
      anchorInstructionName: 'unknown',
      type: 'unknown',
      programId,
      accounts: ix.accounts,
      rawData: ix.data,
      discriminator: discriminatorHex,
      inputEncoding: parsed.encoding,
      decoderType: 'anchor',
      confidence: 'low',
    };
  }

  const coder = getCoder(programId, targetIdl);

  let decoded: any;
  try {
    decoded = coder.instruction.decode(parsed.buffer);
  } catch {
    return {
      instructionName: 'unknown',
      anchorInstructionName: idlIx.name,
      type: 'unknown',
      programId,
      accounts: ix.accounts,
      rawData: ix.data,
      discriminator: discriminatorHex,
      inputEncoding: parsed.encoding,
      decoderType: 'anchor',
      confidence: 'low',
    };
  }

  if (!decoded) {
    return {
      instructionName: 'unknown',
      anchorInstructionName: 'unknown',
      type: 'unknown',
      programId,
      accounts: ix.accounts,
      rawData: ix.data,
      discriminator: discriminatorHex,
      inputEncoding: parsed.encoding,
      decoderType: 'anchor',
      confidence: 'low',
    };
  }

  const instructionName = toCamelCaseInstructionName(decoded.name);
  const classification = classify(programId, instructionName);
  const { resolved, strict } = resolveAccounts(idlIx, ix.accounts);
  const isNonAnchor = NON_ANCHOR_BINARY_PROGRAMS.has(programId);

  return {
    instructionName,
    anchorInstructionName: decoded.name,
    type: classification.type ?? 'unknown',
    programId,
    accounts: ix.accounts,
    rawData: ix.data,
    decodedData: decoded.data,
    discriminator: discriminatorHex,
    inputEncoding: parsed.encoding,
    decoderType: 'anchor',
    confidence: isNonAnchor ? 'low' : 'high',
    resolvedAccounts: resolved,
    accountsStrictMatch: strict,
    ...(classification.action ? { action: classification.action } : {}),
    ...(isNonAnchor ? { decoderWarning: 'Raydium uses custom non-Anchor binary layouts' } : {}),
  };
}
