import type { Idl } from '@coral-xyz/anchor';
import { instructionDiscriminator } from '../orca/anchor-idl-orca.js';

export const JUPITER_V6_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

export const JUPITER_V6_IDL: Idl = {
  metadata: {
    name: 'jupiter_v6',
    version: '0.1.0',
    spec: '0.1.0',
  },
  address: JUPITER_V6_PROGRAM_ID,

  instructions: [
    {
      name: 'route',
      discriminator: instructionDiscriminator('route'),
      accounts: [
        { name: 'token_program' },
        { name: 'user_transfer_authority' },
        { name: 'user_source_token_account' },
        { name: 'user_destination_token_account' },
      ],
      args: [
        { name: 'in_amount', type: 'u64' },
        { name: 'quoted_out_amount', type: 'u64' },
        { name: 'slippage_bps', type: 'u16' },
        { name: 'platform_fee_bps', type: 'u8' },
      ],
    },
    {
      name: 'exact_out_route',
      discriminator: instructionDiscriminator('exact_out_route'),
      accounts: [
        { name: 'token_program' },
        { name: 'user_transfer_authority' },
        { name: 'user_source_token_account' },
        { name: 'user_destination_token_account' },
      ],
      args: [
        { name: 'out_amount', type: 'u64' },
        { name: 'quoted_in_amount', type: 'u64' },
        { name: 'slippage_bps', type: 'u16' },
        { name: 'platform_fee_bps', type: 'u8' },
      ],
    },
    {
      name: 'shared_accounts_route',
      discriminator: instructionDiscriminator('shared_accounts_route'),
      accounts: [
        { name: 'token_program' },
        { name: 'program_authority' },
        { name: 'user_transfer_authority' },
        { name: 'source_token_account' },
        { name: 'program_source_token_account' },
        { name: 'program_destination_token_account' },
        { name: 'destination_token_account' },
        { name: 'source_mint' },
        { name: 'destination_mint' },
        { name: 'platform_fee_account' },
        { name: 'token_2022_program' },
      ],
      args: [
        { name: 'id', type: 'u8' },
        { name: 'in_amount', type: 'u64' },
        { name: 'quoted_out_amount', type: 'u64' },
        { name: 'slippage_bps', type: 'u16' },
        { name: 'platform_fee_bps', type: 'u8' },
      ],
    },
    {
      name: 'shared_accounts_exact_out_route',
      discriminator: instructionDiscriminator('shared_accounts_exact_out_route'),
      accounts: [
        { name: 'token_program' },
        { name: 'program_authority' },
        { name: 'user_transfer_authority' },
        { name: 'source_token_account' },
        { name: 'program_source_token_account' },
        { name: 'program_destination_token_account' },
        { name: 'destination_token_account' },
        { name: 'source_mint' },
        { name: 'destination_mint' },
        { name: 'platform_fee_account' },
        { name: 'token_2022_program' },
      ],
      args: [
        { name: 'id', type: 'u8' },
        { name: 'out_amount', type: 'u64' },
        { name: 'quoted_in_amount', type: 'u64' },
        { name: 'slippage_bps', type: 'u16' },
        { name: 'platform_fee_bps', type: 'u8' },
      ],
    },
    {
      name: 'set_token_ledger',
      discriminator: instructionDiscriminator('set_token_ledger'),
      accounts: [{ name: 'token_ledger' }, { name: 'token_account' }],
      args: [],
    },
  ],

  accounts: [],

  types: [
    {
      name: 'bumps',
      type: {
        kind: 'struct',
        fields: [],
      },
    },
  ],

  errors: [],
};
