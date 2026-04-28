import { BN, BorshCoder } from '@coral-xyz/anchor';
import { describe, expect, it } from 'vitest';
import {
  MARINADE_IDL,
  MARINADE_PROGRAM_ID,
  decodeAnchorInstruction,
} from '../../src/analysis/decoders/anchor-idl';
import type { ParsedInstruction } from '../../src/analysis/types';

const marinadeCoder = new BorshCoder(MARINADE_IDL);

function buildInstruction(
  name: string,
  args: Record<string, unknown>,
  accounts: string[] = ['Account1']
): ParsedInstruction {
  return {
    programId: MARINADE_PROGRAM_ID,
    programName: 'Marinade Finance',
    accounts,
    data: marinadeCoder.instruction.encode(name, args).toString('hex'),
    depth: 0,
    innerInstructions: [],
  };
}

describe('decodeAnchorInstruction - Marinade Finance', () => {
  it('decodes deposit instruction', () => {
    const ix = buildInstruction('deposit', { lamports: new BN(1_000_000_000) });

    const result = decodeAnchorInstruction(MARINADE_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('deposit');
    expect(result?.anchorInstructionName).toBe('deposit');
    expect(result?.type).toBe('liquidity_pool');
    expect(result?.action).toBe('deposit');
    expect(result?.programId).toBe(MARINADE_PROGRAM_ID);
    expect(result?.decoderType).toBe('anchor');
    expect(result?.confidence).toBe('high');
  });

  it('decodes liquid_unstake instruction', () => {
    const ix = buildInstruction('liquid_unstake', { msol_amount: new BN(500_000_000) });

    const result = decodeAnchorInstruction(MARINADE_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('liquidUnstake');
    expect(result?.anchorInstructionName).toBe('liquid_unstake');
    expect(result?.type).toBe('liquid_staking');
    expect(result?.action).toBe('unstake');
  });

  it('decodes order_unstake instruction', () => {
    const ix = buildInstruction('order_unstake', { msol_amount: new BN(250_000_000) });

    const result = decodeAnchorInstruction(MARINADE_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('orderUnstake');
    expect(result?.anchorInstructionName).toBe('order_unstake');
    expect(result?.type).toBe('liquid_staking');
    expect(result?.action).toBe('order_unstake');
  });

  it('decodes claim instruction', () => {
    const ix = buildInstruction('claim', {}, [
      'State1',
      'Reserve1',
      'Ticket1',
      'Dest1',
      'Clock1',
      'Sys1',
    ]);

    const result = decodeAnchorInstruction(MARINADE_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('claim');
    expect(result?.anchorInstructionName).toBe('claim');
    expect(result?.type).toBe('liquid_staking');
    expect(result?.action).toBe('claim');
  });

  it('decodes deposit_stake_account instruction', () => {
    const ix = buildInstruction('deposit_stake_account', { validator_index: 42 });

    const result = decodeAnchorInstruction(MARINADE_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('depositStakeAccount');
    expect(result?.anchorInstructionName).toBe('deposit_stake_account');
    expect(result?.type).toBe('liquid_staking');
    expect(result?.action).toBe('deposit_stake');
  });

  it('resolves deposit account names', () => {
    const accounts = [
      'StateAcc',
      'MsolMint',
      'LiqSolLeg',
      'LiqMsolLeg',
      'LiqMsolAuth',
      'ReservePda',
      'TransferFrom',
      'MintTo',
      'MsolMintAuth',
      'SystemProg',
      'TokenProg',
    ];
    const ix = buildInstruction('deposit', { lamports: new BN(2_000_000_000) }, accounts);

    const result = decodeAnchorInstruction(MARINADE_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.resolvedAccounts).toHaveLength(11);
    expect(result?.resolvedAccounts?.[0]?.name).toBe('state');
    expect(result?.resolvedAccounts?.[6]?.name).toBe('transfer_from');
    expect(result?.resolvedAccounts?.[7]?.name).toBe('mint_to');
    expect(result?.accountsStrictMatch).toBe(true);
  });

  it('resolves liquid_unstake account names', () => {
    const accounts = Array.from({ length: 10 }, (_, i) => `Acc${i}`);
    const ix = buildInstruction('liquid_unstake', { msol_amount: new BN(100_000_000) }, accounts);

    const result = decodeAnchorInstruction(MARINADE_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.resolvedAccounts?.[4]?.name).toBe('treasury_msol_account');
    expect(result?.resolvedAccounts?.[6]?.name).toBe('get_msol_from_authority');
    expect(result?.resolvedAccounts?.[7]?.name).toBe('transfer_sol_to');
  });
});

describe('decodeAnchorInstruction - Marinade hardening', () => {
  it('decodes base64 instruction payloads', () => {
    const hexIx = buildInstruction('deposit', { lamports: new BN(1_000_000_000) });
    const base64Ix = { ...hexIx, data: Buffer.from(hexIx.data, 'hex').toString('base64') };

    const result = decodeAnchorInstruction(MARINADE_PROGRAM_ID, base64Ix);

    expect(result).not.toBeNull();
    expect(result?.inputEncoding).toBe('base64');
    expect(result?.instructionName).toBe('deposit');
  });

  it('returns null for malformed payload', () => {
    const badIx = {
      ...buildInstruction('deposit', { lamports: new BN(1) }),
      data: '###bad-data###',
    };

    expect(decodeAnchorInstruction(MARINADE_PROGRAM_ID, badIx)).toBeNull();
  });

  it('keeps all runtime accounts even when IDL account list is shorter', () => {
    const extraAccounts = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
    const ix = buildInstruction('deposit', { lamports: new BN(1_000_000_000) }, extraAccounts);

    const result = decodeAnchorInstruction(MARINADE_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.resolvedAccounts).toHaveLength(13);
    expect(result?.accountsStrictMatch).toBe(false);
    expect(result?.resolvedAccounts?.[11]?.name).toBe('unknown_11');
    expect(result?.resolvedAccounts?.[12]?.name).toBe('unknown_12');
  });

  it('returns unknown fallback for unrecognized discriminator', () => {
    // All-zeros discriminator won't match any Marinade instruction
    const unknownDiscriminator = '00'.repeat(16);

    const ix = {
      programId: MARINADE_PROGRAM_ID,
      programName: 'Marinade Finance',
      accounts: ['Account1'],
      data: unknownDiscriminator,
      depth: 0,
      innerInstructions: [],
    } as ParsedInstruction;

    const result = decodeAnchorInstruction(MARINADE_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('unknown');
    expect(result?.decoderType).toBe('anchor');
  });

  it('returns null for wrong program ID', () => {
    const ix = buildInstruction('deposit', { lamports: new BN(1_000_000_000) });
    const wrongProgramId = 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc';

    expect(decodeAnchorInstruction(wrongProgramId, ix)).toBeNull();
  });

  it('decodes deposit decoded data contains lamports', () => {
    const ix = buildInstruction('deposit', { lamports: new BN(5_000_000_000) });

    const result = decodeAnchorInstruction(MARINADE_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.decodedData).toBeDefined();
    // BN serializes to object; verify the key exists
    expect(result?.decodedData).toHaveProperty('lamports');
  });

  it('decodes liquid_unstake decoded data contains msol_amount', () => {
    const ix = buildInstruction('liquid_unstake', { msol_amount: new BN(1_000_000) });

    const result = decodeAnchorInstruction(MARINADE_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.decodedData).toHaveProperty('msol_amount');
  });
});
