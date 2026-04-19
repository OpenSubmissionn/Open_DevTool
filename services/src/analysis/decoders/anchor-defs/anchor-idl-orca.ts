import { createHash } from "crypto";
import type { Idl } from "@coral-xyz/anchor";

export const ORCA_WHIRLPOOL_PROGRAM_ID = "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc";

// Anchor instruction discriminator = first 8 bytes of sha256("global:<ix_name>").
export function instructionDiscriminator(name: string): number[] {
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
			accounts: [
				{ name: "whirlpools_config" },
				{ name: "token_mint_a" },
				{ name: "token_mint_b" },
				{ name: "funder" },
				{ name: "whirlpool" },
				{ name: "token_vault_a" },
				{ name: "token_vault_b" },
				{ name: "fee_tier" },
				{ name: "token_program" },
				{ name: "system_program" },
				{ name: "rent" },
			],
			args: [
				{ name: "bumps", type: { defined: { name: "WhirlpoolBumps" } } },
				{ name: "tick_spacing", type: "u16" },
				{ name: "initial_sqrt_price", type: "u128" },
			],
		},
		{
			name: "open_position",
			discriminator: instructionDiscriminator("open_position"),
			accounts: [
				{ name: "funder" },
				{ name: "owner" },
				{ name: "position" },
				{ name: "position_mint" },
				{ name: "position_token_account" },
				{ name: "whirlpool" },
				{ name: "token_program" },
				{ name: "system_program" },
				{ name: "rent" },
				{ name: "associated_token_program" },
			],
			args: [
				{ name: "bumps", type: { defined: { name: "OpenPositionBumps" } } },
				{ name: "tick_lower_index", type: "i32" },
				{ name: "tick_upper_index", type: "i32" },
			],
		},
		{
			name: "open_position_with_metadata",
			discriminator: instructionDiscriminator("open_position_with_metadata"),
			accounts: [
				{ name: "funder" },
				{ name: "owner" },
				{ name: "position" },
				{ name: "position_mint" },
				{ name: "position_metadata_account" },
				{ name: "position_token_account" },
				{ name: "whirlpool" },
				{ name: "token_program" },
				{ name: "system_program" },
				{ name: "rent" },
				{ name: "associated_token_program" },
				{ name: "metadata_program" },
			],
			args: [
				{ name: "bumps", type: { defined: { name: "OpenPositionWithMetadataBumps" } } },
				{ name: "tick_lower_index", type: "i32" },
				{ name: "tick_upper_index", type: "i32" },
			],
		},
		{
			name: "swap",
			discriminator: instructionDiscriminator("swap"),
			accounts: [
				{ name: "token_program" },
				{ name: "token_authority" },
				{ name: "whirlpool" },
				{ name: "token_owner_account_a" },
				{ name: "token_vault_a" },
				{ name: "token_owner_account_b" },
				{ name: "token_vault_b" },
				{ name: "tick_array_0" },
				{ name: "tick_array_1" },
				{ name: "tick_array_2" },
				{ name: "oracle" },
			],
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
			accounts: [
				{ name: "whirlpool" },
				{ name: "token_program" },
				{ name: "position_authority" },
				{ name: "position" },
				{ name: "position_token_account" },
				{ name: "token_owner_account_a" },
				{ name: "token_owner_account_b" },
				{ name: "token_vault_a" },
				{ name: "token_vault_b" },
				{ name: "tick_array_lower" },
				{ name: "tick_array_upper" },
			],
			args: [
				{ name: "liquidity_amount", type: "u128" },
				{ name: "token_max_a", type: "u64" },
				{ name: "token_max_b", type: "u64" },
			],
		},
		{
			name: "decrease_liquidity",
			discriminator: instructionDiscriminator("decrease_liquidity"),
			accounts: [
				{ name: "whirlpool" },
				{ name: "token_program" },
				{ name: "position_authority" },
				{ name: "position" },
				{ name: "position_token_account" },
				{ name: "token_owner_account_a" },
				{ name: "token_owner_account_b" },
				{ name: "token_vault_a" },
				{ name: "token_vault_b" },
				{ name: "tick_array_lower" },
				{ name: "tick_array_upper" },
			],
			args: [
				{ name: "liquidity_amount", type: "u128" },
				{ name: "token_min_a", type: "u64" },
				{ name: "token_min_b", type: "u64" },
			],
		},
		{
			name: "close_position",
			discriminator: instructionDiscriminator("close_position"),
			accounts: [
				{ name: "position_authority" },
				{ name: "receiver" },
				{ name: "position" },
				{ name: "position_mint" },
				{ name: "position_token_account" },
				{ name: "token_program" },
			],
			args: [],
		},
	],
	accounts: [],
	types: [
		{
			name: "WhirlpoolBumps",
			type: {
				kind: "struct",
				fields: [{ name: "whirlpool_bump", type: "u8" }],
			},
		},
		{
			name: "OpenPositionBumps",
			type: {
				kind: "struct",
				fields: [{ name: "position_bump", type: "u8" }],
			},
		},
		{
			name: "OpenPositionWithMetadataBumps",
			type: {
				kind: "struct",
				fields: [
					{ name: "position_bump", type: "u8" },
					{ name: "metadata_bump", type: "u8" },
				],
			},
		},
	],
	errors: [],
};
