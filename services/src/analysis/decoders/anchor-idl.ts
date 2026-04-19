import { createHash } from "crypto";
import { BorshCoder, type Idl } from "@coral-xyz/anchor";
import type { ParsedInstruction } from "../types";

export const ORCA_WHIRLPOOL_PROGRAM_ID = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";

function instructionDiscriminator(name: string): number[] {
	return Array.from(
		createHash("sha256")
			.update(`global:${name}`)
			.digest()
			.subarray(0, 8)
	);
}

export const ORCA_WHIRLPOOL_IDL: Idl = {
	metadata: {
		name: "whirlpool",
		version: "0.1.0",
		spec: "0.1.0",
	},
	address: ORCA_WHIRLPOOL_PROGRAM_ID,
	instructions: [
		{
			name: "initialize_pool",
			discriminator: instructionDiscriminator("initialize_pool"),
			accounts: [],
			args: [
				{ name: "tick_spacing", type: "u16" },
				{ name: "initial_sqrt_price", type: "u128" },
			],
		},
		{
			name: "open_position",
			discriminator: instructionDiscriminator("open_position"),
			accounts: [],
			args: [
				{ name: "tick_lower_index", type: "i32" },
				{ name: "tick_upper_index", type: "i32" },
			],
		},
		{
			name: "open_position_with_metadata",
			discriminator: instructionDiscriminator("open_position_with_metadata"),
			accounts: [],
			args: [
				{ name: "tick_lower_index", type: "i32" },
				{ name: "tick_upper_index", type: "i32" },
			],
		},
		{
			name: "swap",
			discriminator: instructionDiscriminator("swap"),
			accounts: [],
			args: [
				{ name: "amount", type: "u64" },
				{ name: "other_amount_threshold", type: "u64" },
				{ name: "sqrt_price_limit", type: "u128" },
				{ name: "amount_specified_is_input", type: "bool" },
				{ name: "a_to_b", type: "bool" },
			],
		},
		{
			name: "increase_liquidity",
			discriminator: instructionDiscriminator("increase_liquidity"),
			accounts: [],
			args: [
				{ name: "liquidity_amount", type: "u128" },
				{ name: "token_max_a", type: "u64" },
				{ name: "token_max_b", type: "u64" },
			],
		},
		{
			name: "decrease_liquidity",
			discriminator: instructionDiscriminator("decrease_liquidity"),
			accounts: [],
			args: [
				{ name: "liquidity_amount", type: "u128" },
				{ name: "token_min_a", type: "u64" },
				{ name: "token_min_b", type: "u64" },
			],
		},
		{
			name: "close_position",
			discriminator: instructionDiscriminator("close_position"),
			accounts: [],
			args: [],
		},
	],
	accounts: [],
	types: [],
	errors: [],
};

export interface DecodedAnchorInstruction {
	instructionName: string;
	anchorInstructionName: string;
	type: string;
	programId: string;
	accounts: string[];
	rawData: string;
	decodedData?: unknown;
	discriminator?: string;
	action?: string;
	[key: string]: unknown;
}

function toCamelCaseInstructionName(name: string): string {
	return name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function classifyInstruction(name: string): { type: string; action?: string } {
	switch (name) {
		case "swap":
			return { type: "swap" };
		case "openPosition":
		case "openPositionWithMetadata":
			return { type: "liquidity_position", action: "open" };
		case "closePosition":
			return { type: "liquidity_position", action: "close" };
		case "increaseLiquidity":
			return { type: "liquidity_adjustment", action: "increase" };
		case "decreaseLiquidity":
			return { type: "liquidity_adjustment", action: "decrease" };
		case "initializePool":
			return { type: "pool_initialization" };
		default:
			return { type: "unknown" };
	}
}

function decodeHexInstructionData(data: string): Buffer | null {
	const trimmed = data.trim();
	if (trimmed.length === 0 || trimmed.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(trimmed)) {
		try {
			const base64Buffer = Buffer.from(trimmed, "base64");
			return base64Buffer.length > 0 ? base64Buffer : null;
		} catch {
			return null;
		}
	}

	return Buffer.from(trimmed, "hex");
}

export function decodeAnchorInstruction(
	programId: string,
	ix: ParsedInstruction,
	idl: Idl = ORCA_WHIRLPOOL_IDL
): DecodedAnchorInstruction | null {
	if (!ix || typeof ix.data !== "string" || ix.data.trim().length === 0) {
		return null;
	}

	if (programId !== ORCA_WHIRLPOOL_PROGRAM_ID && programId !== idl.address) {
		return null;
	}

	const encodedData = decodeHexInstructionData(ix.data);
	if (!encodedData) {
		return null;
	}

	const coder = new BorshCoder(idl);
	const decoded = coder.instruction.decode(encodedData);
	if (!decoded) {
		return null;
	}

	const instructionName = toCamelCaseInstructionName(decoded.name);
	const { type, action } = classifyInstruction(instructionName);
	const discriminator = encodedData.subarray(0, 8).toString("hex");

	return {
		instructionName,
		anchorInstructionName: decoded.name,
		type,
		programId,
		accounts: ix.accounts,
		rawData: ix.data,
		decodedData: decoded.data,
		discriminator,
		...(action ? { action } : {}),
	};
}
