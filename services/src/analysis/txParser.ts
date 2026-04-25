/** txParser short explanation:
 * Parses a raw Solana transaction bundle into a normalized instruction model.
 *
 * It computes:
 * - Top-level instructions with resolved program names
 * - Instruction accounts resolved to readable pubkeys
 * - Instruction data normalized to hex
 * - Inner instructions grouped by parent index and attached as children
 * - Transaction fee from RPC metadata with payer-balance fallback
 * - Instruction depth metadata (0 for outer, 1 for attached inner)
 *
 * Returns a ParsedTransaction with execution status and parsed instruction tree.
 */

import { getProgramNameSync } from '../solana/programs';
import { buildCPITree, type ExecutionSnapshot } from './cpiTreeBuilder';
import type { ParsedInstruction, ParsedTransaction, RawTransactionBundle } from './types';

type UnknownRecord = Record<string, unknown>;

interface ParsedInstructionRef {
  instruction: ParsedInstruction;
  key: string;
}

interface CUAttributionEntry {
  cuConsumed: number;
  traceOrdinal: number;
}

interface CUQueueBuildResult {
  queues: Map<string, CUAttributionEntry[]>;
  keyCounts: Map<string, number>;
  isTraceTruncated: boolean;
}

// Narrow unknown values before safe structured access.
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

// Handles account key variants from parsed and partially decoded message formats.
function normalizeAccountKey(accountKey: unknown): string {
  if (typeof accountKey === 'string') {
    return accountKey;
  }

  if (!isRecord(accountKey)) {
    return 'unknown-account';
  }

  const pubkey = accountKey.pubkey;
  if (typeof pubkey === 'string') {
    return pubkey;
  }

  if (isRecord(pubkey) && typeof pubkey.toBase58 === 'function') {
    return String(pubkey.toBase58());
  }

  if (typeof accountKey.toBase58 === 'function') {
    return String(accountKey.toBase58());
  }

  return 'unknown-account';
}

// Normalizes Solana RPC instruction data into lowercase hex.
function normalizeDataToHex(data: unknown): string {
  if (typeof data === 'string') {
    const trimmed = data.trim();

    if (trimmed.length === 0) {
      return '';
    }

    return Buffer.from(trimmed, 'base64').toString('hex');
  }

  if (data instanceof Uint8Array) {
    return Buffer.from(data).toString('hex');
  }

  if (
    Array.isArray(data) &&
    data.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255)
  ) {
    return Buffer.from(data).toString('hex');
  }

  return '';
}

// Extracts outer instructions from the transaction message when present.
function getOuterInstructions(bundle: RawTransactionBundle): UnknownRecord[] {
  if (!isRecord(bundle.transaction)) {
    return [];
  }

  const message = bundle.transaction.message;
  if (!isRecord(message) || !Array.isArray(message.instructions)) {
    return [];
  }

  return message.instructions.filter(isRecord);
}

// Indexes inner instructions by parent outer-instruction index.
function getInnerInstructionMap(innerInstructions: unknown): Map<number, UnknownRecord[]> {
  const map = new Map<number, UnknownRecord[]>();

  if (!Array.isArray(innerInstructions)) {
    return map;
  }

  for (const entry of innerInstructions) {
    if (!isRecord(entry) || typeof entry.index !== 'number' || !Array.isArray(entry.instructions)) {
      continue;
    }

    map.set(entry.index, entry.instructions.filter(isRecord));
  }

  return map;
}

// Resolves program id from either direct programId or programIdIndex.
function resolveProgramId(instruction: UnknownRecord, accountKeys: string[]): string {
  if (typeof instruction.programId === 'string') {
    return instruction.programId;
  }

  if (isRecord(instruction.programId) && typeof instruction.programId.toBase58 === 'function') {
    return String(instruction.programId.toBase58());
  }

  if (typeof instruction.programIdIndex === 'number') {
    return (
      accountKeys[instruction.programIdIndex] ?? `unknown-program-${instruction.programIdIndex}`
    );
  }

  return 'UnknownProgram1111111111111111111111111111111';
}

// Resolves account references to pubkeys for both numeric and object forms.
function resolveAccounts(instruction: UnknownRecord, accountKeys: string[]): string[] {
  if (!Array.isArray(instruction.accounts)) {
    return [];
  }

  return instruction.accounts.map((account) => {
    if (typeof account === 'number') {
      return accountKeys[account] ?? `unknown-account-${account}`;
    }

    return normalizeAccountKey(account);
  });
}

// Builds a normalized ParsedInstruction node with depth metadata.
function getNestedInnerInstructions(instruction: UnknownRecord): UnknownRecord[] {
  if (!Array.isArray(instruction.innerInstructions)) {
    return [];
  }

  return instruction.innerInstructions.filter(isRecord);
}

// Parses an instruction and any nested CPI children attached to it.
function parseInstructionTree(
  instruction: UnknownRecord,
  accountKeys: string[],
  depth: number,
  rawChildren: UnknownRecord[] = []
): ParsedInstruction {
  const programId = resolveProgramId(instruction, accountKeys);
  const accounts = resolveAccounts(instruction, accountKeys);
  const data = normalizeDataToHex(instruction.data);
  const childInstructions =
    rawChildren.length > 0 ? rawChildren : getNestedInnerInstructions(instruction);

  const innerInstructions = childInstructions.map((childInstruction) =>
    parseInstructionTree(childInstruction, accountKeys, depth + 1)
  );

  return {
    programId,
    programName: getProgramNameSync(programId),
    accounts,
    data,
    depth,
    innerInstructions,
  };
}

// Uses RPC fee when available, otherwise falls back to payer balance delta.
function inferFee(bundle: RawTransactionBundle): number {
  const metaFee = bundle.rawResponse?.meta?.fee;
  if (typeof metaFee === 'number') {
    return metaFee;
  }

  const preBalance = bundle.preBalances[0] ?? 0;
  const postBalance = bundle.postBalances[0] ?? 0;
  // Fallback can be inaccurate if bundle balances are malformed; never return negative fees.
  return Math.max(preBalance - postBalance, 0);
}

// Prefers already-normalized logs in the bundle and falls back to raw RPC logs.
function getBundleLogMessages(bundle: RawTransactionBundle): string[] {
  if (Array.isArray(bundle.logMessages)) {
    return bundle.logMessages.filter((log): log is string => typeof log === 'string');
  }

  const rpcLogs = bundle.rawResponse?.meta?.logMessages;
  if (Array.isArray(rpcLogs)) {
    return rpcLogs.filter((log): log is string => typeof log === 'string');
  }

  return [];
}

// Converts a hierarchical execution trace into a flat list while preserving order.
function flattenExecutionSnapshots(nodes: ExecutionSnapshot[]): ExecutionSnapshot[] {
  const flattened: ExecutionSnapshot[] = [];

  for (const node of nodes) {
    flattened.push(node);
    flattened.push(...flattenExecutionSnapshots(node.children));
  }

  return flattened;
}

// Preserves parser traversal order so attribution remains deterministic for repeated keys.
function flattenParsedInstructions(instructions: ParsedInstruction[]): ParsedInstructionRef[] {
  const flattened: ParsedInstructionRef[] = [];

  for (const instruction of instructions) {
    flattened.push({
      instruction,
      key: buildAttributionKey(instruction.programId, instruction.depth),
    });

    if (instruction.innerInstructions.length > 0) {
      flattened.push(...flattenParsedInstructions(instruction.innerInstructions));
    }
  }

  return flattened;
}

function countAttributionKeys(keys: Iterable<string>): Map<string, number> {
  const counts = new Map<string, number>();

  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function calculateNodeAttributionConfidence(
  parsedCount: number,
  traceCount: number,
  isTraceTruncated: boolean
): number {
  if (traceCount <= 0) {
    return 0;
  }

  let confidence = 1;

  // Same program/depth repeated across multiple nodes is deterministic but less unique.
  if (parsedCount > 1 || traceCount > 1) {
    confidence -= 0.2;
  }

  // Cardinality mismatch between parsed and traced nodes increases uncertainty.
  if (parsedCount !== traceCount) {
    confidence -= 0.25;
  }

  if (isTraceTruncated) {
    confidence -= 0.2;
  }

  return clamp(confidence, 0, 1);
}

// Uses program + depth to disambiguate repeated invokes in different CPI levels.
function buildAttributionKey(programId: string, depth: number): string {
  return `${programId}::${depth}`;
}

// Builds CU queues keyed by programId::depth so multiple invokes keep their original order.
function buildCUQueues(logMessages: string[]): CUQueueBuildResult {
  if (logMessages.length === 0) {
    return {
      queues: new Map<string, CUAttributionEntry[]>(),
      keyCounts: new Map<string, number>(),
      isTraceTruncated: false,
    };
  }

  const trace = buildCPITree(logMessages);
  const snapshots = flattenExecutionSnapshots(trace.roots);
  let traceOrdinal = 0;

  const attributionQueues = new Map<string, CUAttributionEntry[]>();
  const traceKeyCounts = new Map<string, number>();

  for (const snapshot of snapshots) {
    if (typeof snapshot.computeUnitsConsumed !== 'number') {
      continue;
    }

    // CPI tree depth starts at 1 for outer instructions, parser depth starts at 0.
    const normalizedDepth = Math.max(snapshot.depth - 1, 0);
    const key = buildAttributionKey(snapshot.programId, normalizedDepth);
    const existingQueue = attributionQueues.get(key) ?? [];
    existingQueue.push({
      cuConsumed: snapshot.computeUnitsConsumed,
      traceOrdinal,
    });
    attributionQueues.set(key, existingQueue);
    traceKeyCounts.set(key, (traceKeyCounts.get(key) ?? 0) + 1);
    traceOrdinal += 1;
  }

  return {
    queues: attributionQueues,
    keyCounts: traceKeyCounts,
    isTraceTruncated: trace.isTruncated,
  };
}

function attributeCUToInstructionTree(
  instructions: ParsedInstruction[],
  queueBuildResult: CUQueueBuildResult
): ParsedTransaction['cuAttribution'] {
  const flattenedInstructions = flattenParsedInstructions(instructions);
  const parsedKeyCounts = countAttributionKeys(flattenedInstructions.map((entry) => entry.key));
  const consumedTraceOrdinals = new Set<number>();

  let matchedNodes = 0;
  let confidenceAccumulator = 0;
  let doubleAttributionCount = 0;

  for (const entry of flattenedInstructions) {
    const queue = queueBuildResult.queues.get(entry.key);
    const parsedCount = parsedKeyCounts.get(entry.key) ?? 0;
    const traceCount = queueBuildResult.keyCounts.get(entry.key) ?? 0;

    entry.instruction.cuAttributionKey = entry.key;

    if (!queue || queue.length === 0) {
      entry.instruction.cuAttributionConfidence = 0;
      continue;
    }

    const matchedCU = queue.shift()!;
    entry.instruction.cuConsumed = matchedCU.cuConsumed;
    entry.instruction.cuAttributionTraceOrdinal = matchedCU.traceOrdinal;

    if (consumedTraceOrdinals.has(matchedCU.traceOrdinal)) {
      doubleAttributionCount += 1;
    }
    consumedTraceOrdinals.add(matchedCU.traceOrdinal);

    const confidence = calculateNodeAttributionConfidence(
      parsedCount,
      traceCount,
      queueBuildResult.isTraceTruncated
    );
    entry.instruction.cuAttributionConfidence = confidence;
    confidenceAccumulator += confidence;
    matchedNodes += 1;
  }

  let unmatchedCUEntries = 0;
  for (const queue of queueBuildResult.queues.values()) {
    unmatchedCUEntries += queue.length;
  }

  const totalNodes = flattenedInstructions.length;
  const ambiguousKeys = [...parsedKeyCounts.keys()].filter((key) => {
    const parsedCount = parsedKeyCounts.get(key) ?? 0;
    const traceCount = queueBuildResult.keyCounts.get(key) ?? 0;
    return Math.max(parsedCount, traceCount) > 1;
  }).length;

  return {
    totalNodes,
    matchedNodes,
    unmatchedNodes: totalNodes - matchedNodes,
    unmatchedCUEntries,
    ambiguousKeys,
    confidence: totalNodes > 0 ? Number((confidenceAccumulator / totalNodes).toFixed(4)) : 1,
    doubleAttributionCount,
    traceTruncated: queueBuildResult.isTraceTruncated,
  };
}

export function parseTransaction(bundle: RawTransactionBundle): ParsedTransaction {
  if (!bundle.signature || typeof bundle.signature !== 'string') {
    throw new Error('Invalid transaction bundle: missing signature');
  }

  // Account keys are normalized once and reused for both outer and inner instructions.
  const accountKeys = (bundle.accountKeys ?? []).map((accountKey) =>
    normalizeAccountKey(accountKey)
  );
  const outerInstructions = getOuterInstructions(bundle);
  const innerInstructionMap = getInnerInstructionMap(bundle.innerInstructions);

  const parsedInstructions: ParsedInstruction[] = outerInstructions.map((instruction, index) => {
    return parseInstructionTree(
      instruction,
      accountKeys,
      0,
      innerInstructionMap.get(index) ?? []
    );
  });

  // CU attribution is optional: if logs are missing, instructions remain without cuConsumed.
  const logMessages = getBundleLogMessages(bundle);
  const queueBuildResult = buildCUQueues(logMessages);
  const cuAttribution = attributeCUToInstructionTree(parsedInstructions, queueBuildResult);

  return {
    signature: bundle.signature,
    slot: bundle.slot,
    blockTime: bundle.blockTime ?? null,
    success: bundle.err == null,
    fee: inferFee(bundle),
    instructions: parsedInstructions,
    cuAttribution,
  };
}
