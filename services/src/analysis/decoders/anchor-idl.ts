import { BorshCoder, type Idl } from '@coral-xyz/anchor';
import type { ParsedInstruction } from '../types';
import {
  ORCA_WHIRLPOOL_IDL,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  instructionDiscriminator,
} from './orca/anchor-idl-orca';
import { JUPITER_V6_IDL, JUPITER_V6_PROGRAM_ID } from './jupiter/anchor-idl-jupiter';
import { RAYDIUM_AMM_IDL, RAYDIUM_AMM_PROGRAM_ID } from './raydium/anchor-idl-raydium';
import { MARINADE_IDL, MARINADE_PROGRAM_ID } from './marinade/idl';
import { MAGIC_EDEN_IDL, MAGIC_EDEN_PROGRAM_ID } from './magic-eden/idl';

// Re-export protocol constants/IDLs from a single entrypoint.
export {
  ORCA_WHIRLPOOL_IDL,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  JUPITER_V6_IDL,
  JUPITER_V6_PROGRAM_ID,
  RAYDIUM_AMM_IDL,
  RAYDIUM_AMM_PROGRAM_ID,
  MARINADE_IDL,
  MARINADE_PROGRAM_ID,
  MAGIC_EDEN_IDL,
  MAGIC_EDEN_PROGRAM_ID,
  instructionDiscriminator,
};

// Program registry used when decodeAnchorInstruction is called without an explicit IDL.
const DEFAULT_IDL_BY_PROGRAM: Record<string, Idl> = {
  [ORCA_WHIRLPOOL_PROGRAM_ID]: ORCA_WHIRLPOOL_IDL,
  [JUPITER_V6_PROGRAM_ID]: JUPITER_V6_IDL,
  [RAYDIUM_AMM_PROGRAM_ID]: RAYDIUM_AMM_IDL,
  [MARINADE_PROGRAM_ID]: MARINADE_IDL,
  [MAGIC_EDEN_PROGRAM_ID]: MAGIC_EDEN_IDL,
};

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
  [key: string]: unknown;
}

export interface DecodeAnchorOptions {
  allowNonAnchorPrograms?: boolean;
}

function toCamelCaseInstructionName(name: string): string {
  if (!name.includes('_')) {
    return name;
  }

  const parts = name.split('_').filter((part) => part.length > 0);
  if (parts.length === 0) {
    return name;
  }

  return parts
    .map((part, index) => {
      if (index === 0) {
        return part.toLowerCase();
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

function isValidPublicKey(value: string): boolean {
  // Keep validation independent from specific @solana/web3.js runtime shapes.
  // Some versions/export styles do not expose PublicKey as a constructor.
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function areValidAccounts(accounts: unknown): accounts is string[] {
  return (
    Array.isArray(accounts) &&
    accounts.every((account) => typeof account === 'string' && account.length > 0)
  );
}

const INSTRUCTION_CLASSIFICATION: Record<string, { type: string; action?: string }> = {
  swap: { type: 'swap' },
  swapBaseIn: { type: 'swap_pool', action: 'exact_in' },
  swapBaseOut: { type: 'swap_pool', action: 'exact_out' },
  deposit: { type: 'liquidity_pool', action: 'deposit' },
  withdraw: { type: 'liquidity_pool', action: 'withdraw' },
  initialize: { type: 'pool_initialization' },
  route: { type: 'swap_aggregation', action: 'exact_in' },
  sharedAccountsRoute: { type: 'swap_aggregation', action: 'exact_in' },
  exactOutRoute: { type: 'swap_aggregation', action: 'exact_out' },
  sharedAccountsExactOutRoute: { type: 'swap_aggregation', action: 'exact_out' },
  setTokenLedger: { type: 'token_ledger' },
  openPosition: { type: 'liquidity_position', action: 'open' },
  openPositionWithMetadata: { type: 'liquidity_position', action: 'open' },
  closePosition: { type: 'liquidity_position', action: 'close' },
  increaseLiquidity: { type: 'liquidity_adjustment', action: 'increase' },
  decreaseLiquidity: { type: 'liquidity_adjustment', action: 'decrease' },
  initializePool: { type: 'pool_initialization' },
  liquidUnstake: { type: 'liquid_unstake', action: 'unstake' },
  orderUnstake: { type: 'delayed_unstake', action: 'order' },
  claim: { type: 'unstake_claim', action: 'claim' },
  depositStakeAccount: { type: 'liquid_stake', action: 'stake' },
  addLiquidity: { type: 'liquidity_pool', action: 'deposit' },
  removeLiquidity: { type: 'liquidity_pool', action: 'withdraw' },
  sell: { type: 'nft_listing', action: 'list' },
  buy: { type: 'nft_offer', action: 'offer' },
  executeSale: { type: 'nft_trade', action: 'purchase' },
  cancel: { type: 'nft_cancel', action: 'cancel' },
};

// Normalizes protocol-specific instruction names into the analyzer taxonomy.
function classifyInstruction(name: string): { type: string; action?: string } {
  return INSTRUCTION_CLASSIFICATION[name] ?? { type: 'unknown' };
}

// Accepts both parser-normalized hex and RPC-style base64 payloads.
function decodeHexInstructionData(
  data: string
): { buffer: Buffer; encoding: 'hex' | 'base64' } | null {
  const trimmed = data.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (trimmed.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(trimmed)) {
    const hexBuffer = Buffer.from(trimmed, 'hex');
    if (hexBuffer.length > 0) {
      return { buffer: hexBuffer, encoding: 'hex' };
    }
  }

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed) || trimmed.length % 4 !== 0) {
    return null;
  }

  try {
    const base64Buffer = Buffer.from(trimmed, 'base64');
    if (base64Buffer.length > 0) {
      return { buffer: base64Buffer, encoding: 'base64' };
    }
  } catch {
    return null;
  }

  return null;
}

const NON_ANCHOR_BINARY_PROGRAMS = new Set<string>([RAYDIUM_AMM_PROGRAM_ID, MAGIC_EDEN_PROGRAM_ID]);
const CODER_CACHE = new Map<string, BorshCoder>();

function getCachedCoder(programId: string, idl: Idl): BorshCoder {
  const idlName = idl.metadata?.name ?? 'unknown';
  const idlVersion = idl.metadata?.version ?? 'unknown';
  const cacheKey = `${programId}:${idlName}:${idlVersion}`;

  // Reuse coders to avoid rebuilding Borsh layouts on every decode.
  const cached = CODER_CACHE.get(cacheKey);
  if (cached) {
    return cached;
  }

  const coder = new BorshCoder(idl);
  CODER_CACHE.set(cacheKey, coder);
  return coder;
}

function resolveInstructionAccounts(idl: Idl, anchorInstructionName: string, accounts: string[]) {
  const idlInstruction = idl.instructions.find(
    (instruction) => instruction.name === anchorInstructionName
  );
  if (!idlInstruction) {
    return { resolvedAccounts: undefined, accountsStrictMatch: false };
  }

  const accountNames = idlInstruction.accounts
    .map((account) => ('name' in account && typeof account.name === 'string' ? account.name : null))
    .filter((name): name is string => name !== null);

  if (accountNames.length === 0) {
    return { resolvedAccounts: undefined, accountsStrictMatch: false };
  }

  const resolvedAccounts = accounts.map((pubkey, index) => ({
    name: accountNames[index] ?? `unknown_${index}`,
    pubkey,
  }));

  return {
    resolvedAccounts,
    accountsStrictMatch: accountNames.length === accounts.length,
  };
}

function normalizeDecodedData(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }

  return { __raw: data };
}

function findInstructionByDiscriminator(idl: Idl, discriminator: Buffer) {
  return idl.instructions.find((instruction) => {
    if (!Array.isArray(instruction.discriminator)) {
      return false;
    }

    return Buffer.from(instruction.discriminator).equals(discriminator);
  });
}

function buildUnknownDecodedResult(
  programId: string,
  ix: ParsedInstruction,
  parsedData: { buffer: Buffer; encoding: 'hex' | 'base64' },
  decoderType: 'anchor' | 'custom',
  decoderWarning?: string
): DecodedAnchorInstruction {
  // Fallback shape used when a payload cannot be decoded safely.
  return {
    instructionName: 'unknown',
    anchorInstructionName: 'unknown',
    type: 'unknown',
    programId,
    accounts: ix.accounts,
    rawData: ix.data,
    discriminator: parsedData.buffer.subarray(0, 8).toString('hex'),
    inputEncoding: parsedData.encoding,
    decoderType,
    confidence: 'low',
    ...(decoderWarning ? { decoderWarning } : {}),
  };
}

export function decodeAnchorInstruction(
  programId: string,
  ix: ParsedInstruction,
  idl?: Idl,
  options?: DecodeAnchorOptions
): DecodedAnchorInstruction | null {
  // Input guards to avoid invalid decode attempts.
  if (typeof programId !== 'string' || !isValidPublicKey(programId)) {
    return null;
  }

  if (
    !ix ||
    typeof ix.data !== 'string' ||
    ix.data.trim().length === 0 ||
    !areValidAccounts(ix.accounts)
  ) {
    return null;
  }

  if (typeof ix.programId === 'string' && ix.programId !== programId) {
    return null;
  }

  const targetIdl = idl ?? DEFAULT_IDL_BY_PROGRAM[programId];
  if (!targetIdl) {
    return null;
  }

  if (programId !== targetIdl.address) {
    return null;
  }

  const parsedData = decodeHexInstructionData(ix.data);
  if (!parsedData || parsedData.buffer.length < 8) {
    return null;
  }

  const allowNonAnchorPrograms = options?.allowNonAnchorPrograms ?? true;

  if (!allowNonAnchorPrograms && NON_ANCHOR_BINARY_PROGRAMS.has(programId)) {
    return buildUnknownDecodedResult(
      programId,
      ix,
      parsedData,
      'custom',
      'This program uses custom non-Anchor binary layouts on-chain; use a dedicated custom decoder.'
    );
  }

  // Validate discriminator first, then decode.
  const discriminatorBuffer = parsedData.buffer.subarray(0, 8);
  const idlInstruction = findInstructionByDiscriminator(targetIdl, discriminatorBuffer);
  if (!idlInstruction) {
    return buildUnknownDecodedResult(programId, ix, parsedData, 'anchor');
  }

  // BorshCoder decodes using the hardcoded (or injected) Anchor IDL.
  const coder = getCachedCoder(programId, targetIdl);
  let decoded: { name: string; data: unknown } | null = null;
  try {
    decoded = coder.instruction.decode(parsedData.buffer) as { name: string; data: unknown } | null;
  } catch {
    return buildUnknownDecodedResult(programId, ix, parsedData, 'anchor');
  }

  if (!decoded) {
    return buildUnknownDecodedResult(programId, ix, parsedData, 'anchor');
  }

  const instructionName = toCamelCaseInstructionName(decoded.name);
  const { type, action } = classifyInstruction(instructionName);
  const discriminator = parsedData.buffer.subarray(0, 8).toString('hex');
  const { resolvedAccounts, accountsStrictMatch } = resolveInstructionAccounts(
    targetIdl,
    decoded.name,
    ix.accounts
  );
  const isNonAnchorBinaryProgram = NON_ANCHOR_BINARY_PROGRAMS.has(programId);
  const decoderWarning = isNonAnchorBinaryProgram
    ? 'This program commonly uses custom non-Anchor binary layouts on-chain; decoded via Anchor IDL in compatibility mode.'
    : undefined;

  return {
    instructionName,
    anchorInstructionName: decoded.name,
    type,
    programId,
    accounts: ix.accounts,
    rawData: ix.data,
    decodedData: normalizeDecodedData(decoded.data),
    discriminator,
    inputEncoding: parsedData.encoding,
    decoderType: 'anchor',
    confidence: isNonAnchorBinaryProgram ? 'low' : 'high',
    ...(resolvedAccounts ? { resolvedAccounts } : {}),
    ...(decoderWarning ? { decoderWarning } : {}),
    accountsStrictMatch,
    ...(action ? { action } : {}),
  };
}
