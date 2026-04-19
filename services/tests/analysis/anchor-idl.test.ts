import { BN, BorshCoder } from "@coral-xyz/anchor";
import { describe, expect, it } from "vitest";
import { ORCA_WHIRLPOOL_IDL, ORCA_WHIRLPOOL_PROGRAM_ID, decodeAnchorInstruction } from "../../src/analysis/decoders/anchor-idl";
import type { ParsedInstruction } from "../../src/analysis/types";

const coder = new BorshCoder(ORCA_WHIRLPOOL_IDL);

function buildInstruction(name: string, args: Record<string, unknown>, accounts: string[] = ["Account1"]) {
	return {
		programId: ORCA_WHIRLPOOL_PROGRAM_ID,
		programName: "Orca Whirlpool",
		accounts,
		data: coder.instruction.encode(name, args).toString("hex"),
		depth: 0,
		innerInstructions: [],
	} as ParsedInstruction;
}

describe("decodeAnchorInstruction - Orca Whirlpool", () => {
	it("decodes initialize pool instruction", () => {
		const ix = buildInstruction("initialize_pool", {
			tick_spacing: 64,
			initial_sqrt_price: new BN(1000000),
		});

		const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix);

		expect(result).not.toBeNull();
		expect(result?.instructionName).toBe("initializePool");
		expect(result?.anchorInstructionName).toBe("initialize_pool");
		expect(result?.type).toBe("pool_initialization");
		expect(result?.programId).toBe(ORCA_WHIRLPOOL_PROGRAM_ID);
		expect(result?.decodedData).toMatchObject({
			tick_spacing: 64,
		});
	});

	it("decodes open position instruction", () => {
		const ix = buildInstruction("open_position", {
			tick_lower_index: -64,
			tick_upper_index: 64,
		});

		const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix);

		expect(result).not.toBeNull();
		expect(result?.instructionName).toBe("openPosition");
		expect(result?.anchorInstructionName).toBe("open_position");
		expect(result?.type).toBe("liquidity_position");
		expect(result?.action).toBe("open");
		expect(result?.decodedData).toMatchObject({
			tick_lower_index: -64,
			tick_upper_index: 64,
		});
	});

	it("decodes close position instruction", () => {
		const ix = buildInstruction("close_position", {}, ["Position1", "Authority1"]);

		const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix);

		expect(result).not.toBeNull();
		expect(result?.instructionName).toBe("closePosition");
		expect(result?.anchorInstructionName).toBe("close_position");
		expect(result?.type).toBe("liquidity_position");
		expect(result?.action).toBe("close");
		expect(result?.rawData.length).toBeGreaterThan(0);
	});

	it("decodes swap instruction with amount and threshold", () => {
		const ix = buildInstruction("swap", {
			amount: new BN(1_000_000_000),
			other_amount_threshold: new BN(990_000_000),
			sqrt_price_limit: new BN(0),
			amount_specified_is_input: true,
			a_to_b: false,
		});

		const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix);

		expect(result).not.toBeNull();
		expect(result?.instructionName).toBe("swap");
		expect(result?.anchorInstructionName).toBe("swap");
		expect(result?.type).toBe("swap");
		expect(result?.decodedData).toMatchObject({
			amount_specified_is_input: true,
			a_to_b: false,
		});
	});

	it("decodes increase liquidity instruction", () => {
		const ix = buildInstruction("increase_liquidity", {
			liquidity_amount: new BN(500_000),
			token_max_a: new BN(1_000_000),
			token_max_b: new BN(2_000_000),
		});

		const result = decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix);

		expect(result).not.toBeNull();
		expect(result?.instructionName).toBe("increaseLiquidity");
		expect(result?.anchorInstructionName).toBe("increase_liquidity");
		expect(result?.type).toBe("liquidity_adjustment");
		expect(result?.action).toBe("increase");
		const decodedData = result?.decodedData as { token_max_a: BN; token_max_b: BN };
		expect(decodedData.token_max_a.toString()).toBe("1000000");
		expect(decodedData.token_max_b.toString()).toBe("2000000");
	});

	it("returns null for wrong program id", () => {
		const ix = buildInstruction("swap", {
			amount: new BN(1),
			other_amount_threshold: new BN(1),
			sqrt_price_limit: new BN(0),
			amount_specified_is_input: true,
			a_to_b: true,
		});

		expect(
			decodeAnchorInstruction("whirLbMiicVdio4KfUqKKvsLDrilLuSJ5kDzvMccH", ix)
		).toBeNull();
	});

	it("returns null for invalid instruction data", () => {
		const ix: ParsedInstruction = {
			programId: ORCA_WHIRLPOOL_PROGRAM_ID,
			programName: "Orca Whirlpool",
			accounts: ["Account1"],
			data: "not-hex-data",
			depth: 0,
			innerInstructions: [],
		};

		expect(decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, ix)).toBeNull();
	});

	it("returns null for null instruction", () => {
		expect(decodeAnchorInstruction(ORCA_WHIRLPOOL_PROGRAM_ID, null as any)).toBeNull();
	});
});
