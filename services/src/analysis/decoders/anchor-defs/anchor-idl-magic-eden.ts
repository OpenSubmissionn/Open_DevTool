import type { Idl } from '@coral-xyz/anchor';
import { instructionDiscriminator } from '../orca/anchor-idl-orca.js';

// Magic Eden v2 (MMM) program — NFT marketplace.
// Reference: https://github.com/metaplex-foundation/mmm
// Decode mode IDL: discriminators + arg types only; account validation
// is performed against the transaction's accountKeys at decode time.
export const MAGIC_EDEN_MMM_PROGRAM_ID = 'M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K';

export const MAGIC_EDEN_MMM_IDL: Idl = {
  metadata: {
    name: 'magic_eden_mmm',
    version: '0.1.0',
    spec: '0.1.0',
  },
  address: MAGIC_EDEN_MMM_PROGRAM_ID,
  instructions: [
    {
      name: 'sol_create_pool',
      discriminator: instructionDiscriminator('sol_create_pool'),
      accounts: [],
      args: [
        { name: 'spot_price', type: 'u64' },
        { name: 'curve_type', type: 'u8' },
        { name: 'curve_delta', type: 'u64' },
        { name: 'reinvest_fulfill_buy', type: 'bool' },
        { name: 'reinvest_fulfill_sell', type: 'bool' },
        { name: 'expiry', type: 'i64' },
        { name: 'lp_fee_bp', type: 'u16' },
        { name: 'referral_bp', type: 'u16' },
      ],
    },
    {
      name: 'sol_close_pool',
      discriminator: instructionDiscriminator('sol_close_pool'),
      accounts: [],
      args: [],
    },
    {
      name: 'sol_deposit_buy',
      discriminator: instructionDiscriminator('sol_deposit_buy'),
      accounts: [],
      args: [{ name: 'payment_amount', type: 'u64' }],
    },
    {
      name: 'sol_withdraw_buy',
      discriminator: instructionDiscriminator('sol_withdraw_buy'),
      accounts: [],
      args: [{ name: 'payment_amount', type: 'u64' }],
    },
    {
      name: 'sol_fulfill_buy',
      discriminator: instructionDiscriminator('sol_fulfill_buy'),
      accounts: [],
      args: [
        { name: 'asset_amount', type: 'u64' },
        { name: 'min_payment_amount', type: 'u64' },
        { name: 'allowlist_aux', type: { option: 'string' } },
        { name: 'maker_fee_bp', type: 'i16' },
        { name: 'taker_fee_bp', type: 'i16' },
      ],
    },
    {
      name: 'sol_fulfill_sell',
      discriminator: instructionDiscriminator('sol_fulfill_sell'),
      accounts: [],
      args: [
        { name: 'asset_amount', type: 'u64' },
        { name: 'max_payment_amount', type: 'u64' },
        { name: 'allowlist_aux', type: { option: 'string' } },
        { name: 'maker_fee_bp', type: 'i16' },
        { name: 'taker_fee_bp', type: 'i16' },
      ],
    },
    {
      name: 'mip1_sell',
      discriminator: instructionDiscriminator('mip1_sell'),
      accounts: [],
      args: [
        { name: 'price', type: 'u64' },
        { name: 'expiry', type: 'i64' },
      ],
    },
    {
      name: 'mip1_cancel_sell',
      discriminator: instructionDiscriminator('mip1_cancel_sell'),
      accounts: [],
      args: [],
    },
    {
      name: 'mip1_fulfill_buy',
      discriminator: instructionDiscriminator('mip1_fulfill_buy'),
      accounts: [],
      args: [
        { name: 'asset_amount', type: 'u64' },
        { name: 'min_payment_amount', type: 'u64' },
        { name: 'maker_fee_bp', type: 'i16' },
        { name: 'taker_fee_bp', type: 'i16' },
      ],
    },
  ],
  accounts: [],
  types: [],
  errors: [],
};
