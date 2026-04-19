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

import { getProgramName } from '../solana/programs';
import type { ParsedInstruction, ParsedTransaction, RawTransactionBundle } from './types';

type UnknownRecord = Record<string, unknown>;

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

	if (Array.isArray(data) && data.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255)) {
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
		return accountKeys[instruction.programIdIndex] ?? `unknown-program-${instruction.programIdIndex}`;
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
function parseInstruction(
	instruction: UnknownRecord,
	accountKeys: string[],
	depth: number
): ParsedInstruction {
	const programId = resolveProgramId(instruction, accountKeys);
	const accounts = resolveAccounts(instruction, accountKeys);
	const data = normalizeDataToHex(instruction.data);

	return {
		programId,
		programName: getProgramName(programId),
		accounts,
		data,
		depth,
		innerInstructions: [],
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

export function parseTransaction(bundle: RawTransactionBundle): ParsedTransaction {
	if (!bundle.signature || typeof bundle.signature !== 'string') {
		throw new Error('Invalid transaction bundle: missing signature');
	}

	const accountKeys = (bundle.accountKeys ?? []).map((accountKey) => normalizeAccountKey(accountKey));
	const outerInstructions = getOuterInstructions(bundle);
	const innerInstructionMap = getInnerInstructionMap(bundle.innerInstructions);

	const parsedInstructions: ParsedInstruction[] = outerInstructions.map((instruction, index) => {
		const parsed = parseInstruction(instruction, accountKeys, 0);
		const innerInstructions = innerInstructionMap.get(index) ?? [];

		// Inner instructions are attached under their parent outer instruction.
		parsed.innerInstructions = innerInstructions.map((innerInstruction) =>
			parseInstruction(innerInstruction, accountKeys, 1)
		);

		return parsed;
	});

	return {
		signature: bundle.signature,
		slot: bundle.slot,
		blockTime: bundle.blockTime ?? null,
		success: bundle.err == null,
		fee: inferFee(bundle),
		instructions: parsedInstructions,
	};
}
