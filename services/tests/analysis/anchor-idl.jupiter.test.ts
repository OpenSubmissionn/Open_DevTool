import { BN, BorshCoder } from '@coral-xyz/anchor';
import { describe, expect, it } from 'vitest';
import {
  JUPITER_V6_IDL,
  JUPITER_V6_PROGRAM_ID,
  ORCA_WHIRLPOOL_IDL,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  decodeAnchorInstruction,
} from '../../src/analysis/decoders/anchor-idl';
import type { ParsedInstruction } from '../../src/analysis/types';

const jupiterCoder = new BorshCoder(JUPITER_V6_IDL);
const orcaCoder = new BorshCoder(ORCA_WHIRLPOOL_IDL);
const FIXTURE_JUPITER_ROUTE_HEX = 'e517cb977ae3ad2a40420f0000000000301b0f0000000000320000';

function buildInstruction(name: string, args: Record<string, unknown>): ParsedInstruction {
  return {
    programId: JUPITER_V6_PROGRAM_ID,
    programName: 'Jupiter v6',
    accounts: ['Account1'],
    data: jupiterCoder.instruction.encode(name, args).toString('hex'),
    depth: 0,
    innerInstructions: [],
  };
}

describe('decodeAnchorInstruction - Jupiter v6', () => {
  it('decodes route instruction', () => {
    const ix = buildInstruction('route', {
      in_amount: new BN(1_000_000),
      quoted_out_amount: new BN(990_000),
      slippage_bps: 50,
      platform_fee_bps: 0,
    });
    const result = decodeAnchorInstruction(JUPITER_V6_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('route');
    expect(result?.type).toBe('swap_aggregation');
  });

  it('decodes exact out route instruction', () => {
    const ix = buildInstruction('exact_out_route', {
      out_amount: new BN(500_000),
      quoted_in_amount: new BN(520_000),
      slippage_bps: 30,
      platform_fee_bps: 1,
    });
    const result = decodeAnchorInstruction(JUPITER_V6_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('exactOutRoute');
    expect(result?.action).toBe('exact_out');
  });

  it('decodes shared accounts route instruction', () => {
    const ix = buildInstruction('shared_accounts_route', {
      id: 0,
      in_amount: new BN(2_000_000),
      quoted_out_amount: new BN(1_980_000),
      slippage_bps: 75,
      platform_fee_bps: 0,
    });
    const result = decodeAnchorInstruction(JUPITER_V6_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('sharedAccountsRoute');
    expect(result?.action).toBe('exact_in');
  });

  it('decodes shared accounts exact out route instruction', () => {
    const ix = buildInstruction('shared_accounts_exact_out_route', {
      id: 0,
      out_amount: new BN(750_000),
      quoted_in_amount: new BN(770_000),
      slippage_bps: 40,
      platform_fee_bps: 0,
    });
    const result = decodeAnchorInstruction(JUPITER_V6_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('sharedAccountsExactOutRoute');
    expect(result?.action).toBe('exact_out');
  });

  it('decodes set token ledger instruction', () => {
    const ix = buildInstruction('set_token_ledger', {});
    const result = decodeAnchorInstruction(JUPITER_V6_PROGRAM_ID, ix);

    expect(result).not.toBeNull();
    expect(result?.instructionName).toBe('setTokenLedger');
    expect(result?.type).toBe('token_ledger');
  });
});

describe('decodeAnchorInstruction - Jupiter hardening', () => {
  it('returns null when ix.programId mismatches decoder programId', () => {
    const ix: ParsedInstruction = {
      programId: ORCA_WHIRLPOOL_PROGRAM_ID,
      programName: 'Orca Whirlpool',
      accounts: ['Account1'],
      data: orcaCoder.instruction
        .encode('swap', {
          amount: new BN(1_000_000),
          other_amount_threshold: new BN(990_000),
          sqrt_price_limit: new BN(0),
          amount_specified_is_input: true,
          a_to_b: true,
        })
        .toString('hex'),
      depth: 0,
      innerInstructions: [],
    };

    expect(decodeAnchorInstruction(JUPITER_V6_PROGRAM_ID, ix)).toBeNull();
  });

  it('decodes fixed Jupiter payload vector', () => {
    const ix = {
      programId: JUPITER_V6_PROGRAM_ID,
      programName: 'Jupiter v6',
      accounts: ['Account1'],
      data: FIXTURE_JUPITER_ROUTE_HEX,
      depth: 0,
      innerInstructions: [],
    } as ParsedInstruction;

    const result = decodeAnchorInstruction(JUPITER_V6_PROGRAM_ID, ix);
    expect(result).not.toBeNull();
    expect(result?.anchorInstructionName).toBe('route');
  });
});
