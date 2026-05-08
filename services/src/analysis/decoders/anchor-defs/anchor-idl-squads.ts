import type { Idl } from '@coral-xyz/anchor';
import { instructionDiscriminator } from '../orca/anchor-idl-orca.js';

// Squads Protocol V4 — on-chain multisig "smart wallet" program.
// Reference: https://github.com/Squads-Protocol/v4
// Substituted in for the task's "Phantom/wallet" program because Phantom
// is an off-chain wallet client with no on-chain program ID.
export const SQUADS_V4_PROGRAM_ID = 'SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf';

export const SQUADS_V4_IDL: Idl = {
  metadata: {
    name: 'squads_v4',
    version: '0.1.0',
    spec: '0.1.0',
  },
  address: SQUADS_V4_PROGRAM_ID,
  instructions: [
    {
      name: 'multisig_create_v2',
      discriminator: instructionDiscriminator('multisig_create_v2'),
      accounts: [],
      args: [
        { name: 'config_authority', type: { option: 'pubkey' } },
        { name: 'threshold', type: 'u16' },
        { name: 'time_lock', type: 'u32' },
        { name: 'memo', type: { option: 'string' } },
      ],
    },
    {
      name: 'config_transaction_create',
      discriminator: instructionDiscriminator('config_transaction_create'),
      accounts: [],
      args: [{ name: 'memo', type: { option: 'string' } }],
    },
    {
      name: 'config_transaction_execute',
      discriminator: instructionDiscriminator('config_transaction_execute'),
      accounts: [],
      args: [],
    },
    {
      name: 'vault_transaction_create',
      discriminator: instructionDiscriminator('vault_transaction_create'),
      accounts: [],
      args: [
        { name: 'vault_index', type: 'u8' },
        { name: 'ephemeral_signers', type: 'u8' },
        { name: 'memo', type: { option: 'string' } },
      ],
    },
    {
      name: 'vault_transaction_execute',
      discriminator: instructionDiscriminator('vault_transaction_execute'),
      accounts: [],
      args: [],
    },
    {
      name: 'proposal_create',
      discriminator: instructionDiscriminator('proposal_create'),
      accounts: [],
      args: [
        { name: 'transaction_index', type: 'u64' },
        { name: 'draft', type: 'bool' },
      ],
    },
    {
      name: 'proposal_approve',
      discriminator: instructionDiscriminator('proposal_approve'),
      accounts: [],
      args: [{ name: 'memo', type: { option: 'string' } }],
    },
    {
      name: 'proposal_reject',
      discriminator: instructionDiscriminator('proposal_reject'),
      accounts: [],
      args: [{ name: 'memo', type: { option: 'string' } }],
    },
    {
      name: 'spending_limit_use',
      discriminator: instructionDiscriminator('spending_limit_use'),
      accounts: [],
      args: [
        { name: 'amount', type: 'u64' },
        { name: 'decimals', type: 'u8' },
        { name: 'memo', type: { option: 'string' } },
      ],
    },
  ],
  accounts: [],
  types: [],
  errors: [],
};
