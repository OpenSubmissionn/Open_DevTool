import type { Idl } from '@coral-xyz/anchor';
import { instructionDiscriminator } from '../orca/anchor-idl-orca';

// Compatibility IDL subset for Raydium decode mode.
export const RAYDIUM_AMM_PROGRAM_ID = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';

export const RAYDIUM_AMM_IDL: Idl = {
  metadata: {
    name: 'raydium_amm',
    version: '0.1.0',
    spec: '0.1.0',
  },
  address: RAYDIUM_AMM_PROGRAM_ID,
  instructions: [
    {
      name: 'initialize',
      discriminator: instructionDiscriminator('initialize'),
      accounts: [],
      args: [
        { name: 'nonce', type: 'u8' },
        { name: 'open_time', type: 'u64' },
      ],
    },
    {
      name: 'deposit',
      discriminator: instructionDiscriminator('deposit'),
      accounts: [],
      args: [
        { name: 'max_coin_amount', type: 'u64' },
        { name: 'max_pc_amount', type: 'u64' },
        { name: 'base_side', type: 'u64' },
      ],
    },
    {
      name: 'withdraw',
      discriminator: instructionDiscriminator('withdraw'),
      accounts: [],
      args: [{ name: 'amount', type: 'u64' }],
    },
    {
      name: 'swap_base_in',
      discriminator: instructionDiscriminator('swap_base_in'),
      accounts: [],
      args: [
        { name: 'amount_in', type: 'u64' },
        { name: 'minimum_amount_out', type: 'u64' },
      ],
    },
    {
      name: 'swap_base_out',
      discriminator: instructionDiscriminator('swap_base_out'),
      accounts: [],
      args: [
        { name: 'max_amount_in', type: 'u64' },
        { name: 'amount_out', type: 'u64' },
      ],
    },
  ],
  accounts: [],
  types: [],
  errors: [],
};
