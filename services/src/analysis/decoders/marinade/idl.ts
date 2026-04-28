import { createHash } from "crypto";
import type { Idl } from "@coral-xyz/anchor";

// Official Marinade Finance program ID
export const MARINADE_PROGRAM_ID =
  "MarBmsSgKXdrN1egZf5sqe1TMThczGgmEhd5VTpYzr8";

// -------------------------------------
// Anchor discriminator helper
// -------------------------------------
export function instructionDiscriminator(name: string): number[] {
  return Array.from(
    createHash("sha256")
      .update(`global:${name}`)
      .digest()
      .subarray(0, 8)
  );
}

// -------------------------------------
// Minimal Marinade IDL (subset)
// -------------------------------------
export const MARINADE_IDL: Idl = {
  address: MARINADE_PROGRAM_ID,

  metadata: {
    name: "marinade",
    version: "0.1.0",
    spec: "0.1.0",
  },

  instructions: [
    {
      name: "deposit",
      discriminator: instructionDiscriminator("deposit"),
      accounts: [
        { name: "state" },
        { name: "msol_mint" },
        { name: "liq_pool_sol_leg_pda" },
        { name: "liq_pool_msol_leg" },
        { name: "reserve_pda" },
        { name: "transfer_from" },
        { name: "mint_to" },
      ],
      args: [
        {
          name: "lamports",
          type: "u64",
        },
      ],
    },
    {
      name: "unstake",
      discriminator: instructionDiscriminator("unstake"),
      accounts: [
        { name: "state" },
        { name: "msol_mint" },
        { name: "burn_from" },
        { name: "transfer_sol_to" },
      ],
      args: [
        {
          name: "msol_amount",
          type: "u64",
        },
      ],
    },
  ],
};